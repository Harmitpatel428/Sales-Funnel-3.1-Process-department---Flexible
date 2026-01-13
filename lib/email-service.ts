import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import * as msal from '@azure/msal-node';
import { PrismaClient, EmailProvider, Email } from '@prisma/client';
import nodemailer from 'nodemailer';
import { getStorageProvider, generateStoragePath } from './storage';
import { convertEmailToLead } from './email-to-lead';

const prisma = new PrismaClient();

export interface IEmailProvider {
  connect(userId: string, authCode: string, redirectUri: string): Promise<EmailProvider>;
  disconnect(userId: string): Promise<void>;
  sendEmail(providerId: string, emailData: any): Promise<any>;
  syncInbox(providerId: string): Promise<any>;
}

export class GmailProvider implements IEmailProvider {
  private oAuth2Client;

  constructor() {
    this.oAuth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
  }

  async connect(userId: string, authCode: string, redirectUri: string): Promise<EmailProvider> {
    const { tokens } = await this.oAuth2Client.getToken({
      code: authCode,
      redirect_uri: redirectUri
    });

    this.oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oAuth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Store in DB
    return await prisma.emailProvider.upsert({
      where: {
        userId_provider_email: {
          userId,
          provider: 'gmail',
          email: userInfo.data.email!
        }
      },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || undefined, // Only update if present
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        userId,
        tenantId: (await prisma.user.findUnique({ where: { id: userId } }))!.tenantId,
        provider: 'gmail',
        email: userInfo.data.email!,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        isActive: true
      }
    });
  }

  async disconnect(userId: string): Promise<void> {
    await prisma.emailProvider.updateMany({
      where: { userId, provider: 'gmail' },
      data: { isActive: false }
    });
  }

  async sendEmail(providerId: string, emailData: any): Promise<any> {
    const provider = await prisma.emailProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error('Provider not found');

    this.oAuth2Client.setCredentials({
      access_token: provider.accessToken,
      refresh_token: provider.refreshToken!
    });

    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    // Simple MIME creation
    const messageParts = [
      `To: ${emailData.to}`,
      `Subject: ${emailData.subject}`,
      `Content-Type: text/html; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      emailData.htmlBody
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    return res.data;
  }

  async syncInbox(providerId: string): Promise<any[]> {
    const provider = await prisma.emailProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error('Provider not found');

    this.oAuth2Client.setCredentials({
      access_token: provider.accessToken,
      refresh_token: provider.refreshToken!
    });

    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    // Filter by date if since present
    let query = '';
    if (provider.lastSyncAt) {
      const seconds = Math.floor(provider.lastSyncAt.getTime() / 1000);
      query = `after:${seconds}`;
    }

    const listRes = await gmail.users.messages.list({ userId: 'me', maxResults: 10, q: query });
    if (!listRes.data.messages || listRes.data.messages.length === 0) return [];

    const messages = [];

    // Helper for recursive parsing
    const processParts = (parts: any[], attachmentsAcc: any[]) => {
      let text = '';
      let html = '';
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          text += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          html += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.filename && part.body?.attachmentId) {
          attachmentsAcc.push({
            filename: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size
          });
        }

        if (part.parts) {
          const sub = processParts(part.parts, attachmentsAcc);
          text += sub.text;
          html += sub.html;
        }
      }
      return { text, html };
    };

    for (const msgStub of listRes.data.messages) {
      if (!msgStub.id) continue;

      try {
        const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msgStub.id, format: 'full' });
        const payload = fullMsg.data.payload;
        if (!payload) continue;

        const headers = payload.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const subject = getHeader('subject') || '(No Subject)';
        const from = getHeader('from');
        const to = getHeader('to').split(',').map(s => s.trim());
        const cc = getHeader('cc') ? getHeader('cc').split(',').map(s => s.trim()) : [];
        const bcc = [] as string[]; // Gmail usually doesn't expose BCC in received emails unless sent by me
        const receivedAt = new Date(parseInt(fullMsg.data.internalDate || Date.now().toString()));

        let htmlBody = '';
        let textBody = '';
        const rawAttachments: any[] = [];

        if (payload.parts) {
          const res = processParts(payload.parts, rawAttachments);
          textBody = res.text;
          htmlBody = res.html;
        } else if (payload.body?.data) {
          if (payload.mimeType === 'text/html') htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
          else textBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }

        // Process Attachments
        const processedAttachments = [];
        const storageProvider = getStorageProvider();
        for (const att of rawAttachments) {
          try {
            const attData = await gmail.users.messages.attachments.get({
              userId: 'me',
              messageId: msgStub.id,
              id: att.attachmentId
            });
            if (attData.data.data) {
              const buffer = Buffer.from(attData.data.data, 'base64');
              const storagePath = generateStoragePath(
                provider.tenantId,
                'uncategorized', // Case unknown yet
                msgStub.id,
                att.filename
              );

              // Upload
              const uploadRes = await storageProvider.uploadFile(buffer, storagePath, {
                contentType: att.mimeType,
                tenantId: provider.tenantId,
                caseId: '',
                documentId: msgStub.id,
                fileName: att.filename
              });

              processedAttachments.push({
                fileName: att.filename,
                mimeType: att.mimeType,
                fileSize: att.size || 0,
                storagePath: uploadRes.path
              });
            }
          } catch (err) {
            console.error(`Failed to download/upload attachment ${att.filename}`, err);
          }
        }

        messages.push({
          messageId: fullMsg.data.id,
          threadId: fullMsg.data.threadId,
          subject,
          from,
          to,
          cc,
          bcc,
          htmlBody,
          textBody,
          receivedAt,
          attachments: processedAttachments
        });
      } catch (e) {
        console.error('Failed to fetch gmail message', msgStub.id, e);
      }
    }

    return messages;
  }
}

export class OutlookProvider implements IEmailProvider {
  private msalConfig;

  constructor() {
    this.msalConfig = {
      auth: {
        clientId: process.env.OUTLOOK_CLIENT_ID!,
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET!,
        authority: "https://login.microsoftonline.com/common"
      }
    };
  }

  async connect(userId: string, authCode: string, redirectUri: string): Promise<EmailProvider> {
    const cca = new msal.ConfidentialClientApplication(this.msalConfig);
    const tokenResponse = await cca.acquireTokenByCode({
      code: authCode,
      redirectUri: redirectUri,
      scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send"]
    });

    if (!tokenResponse) throw new Error("Failed to acquire token");

    // Fetch user profile to get the email address reliably
    // We can use the token to call Graph API /me
    const client = Client.init({
      authProvider: (done) => done(null, tokenResponse.accessToken)
    });
    const user = await client.api('/me').get();
    const email = user.mail || user.userPrincipalName; // Fallback

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) throw new Error("User not found");

    return await prisma.emailProvider.upsert({
      where: {
        userId_provider_email: {
          userId,
          provider: 'outlook',
          email: email
        }
      },
      update: {
        accessToken: tokenResponse.accessToken,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        userId,
        tenantId: dbUser.tenantId,
        provider: 'outlook',
        email: email,
        accessToken: tokenResponse.accessToken,
        refreshToken: "managed-by-msal", // MSAL cache usually implies refresh handling, but here we might need to store it if we got it?
        // Basic flow: tokenResponse might not have refresh token if not requested 'offline_access'.
        // Assuming we got it or will handle re-auth.
        isActive: true
      }
    });
  }

  async disconnect(userId: string): Promise<void> {
    await prisma.emailProvider.updateMany({
      where: { userId, provider: 'outlook' },
      data: { isActive: false }
    });
  }

  async sendEmail(providerId: string, emailData: any): Promise<any> {
    const provider = await prisma.emailProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error("Provider not found");

    const client = Client.init({
      authProvider: (done) => {
        done(null, provider.accessToken);
      }
    });

    const sendMail = {
      message: {
        subject: emailData.subject,
        body: {
          contentType: "HTML",
          content: emailData.htmlBody
        },
        toRecipients: [
          {
            emailAddress: {
              address: emailData.to
            }
          }
        ]
      }
    };

    return await client.api('/me/sendMail').post(sendMail);
  }

  async syncInbox(providerId: string): Promise<any[]> {
    const provider = await prisma.emailProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error("Provider not found");

    const client = Client.init({
      authProvider: (done) => {
        done(null, provider.accessToken);
      }
    });

    // Filter by date
    let filter = '';
    if (provider.lastSyncAt) {
      filter = `receivedDateTime ge ${provider.lastSyncAt.toISOString()}`;
    }

    // Select specific fields
    const res = await client.api('/me/messages')
      .filter(filter)
      .select('id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,body,receivedDateTime,hasAttachments')
      .top(10)
      .get();

    if (!res.value) return [];

    const messages = [];
    const storageProvider = getStorageProvider();

    for (const msg of res.value) {
      const from = `${msg.from?.emailAddress?.name || ''} <${msg.from?.emailAddress?.address || ''}>`;

      // Process Attachments
      const processedAttachments = [];
      if (msg.hasAttachments) {
        try {
          // Fetch attachments
          const attsRes = await client.api(`/me/messages/${msg.id}/attachments`).get();
          const attachments = attsRes.value || [];

          for (const att of attachments) {
            if (att['@odata.type'] === '#microsoft.graph.fileAttachment' && att.contentBytes) {
              const buffer = Buffer.from(att.contentBytes, 'base64');
              const storagePath = generateStoragePath(
                provider.tenantId,
                'uncategorized',
                msg.id,
                att.name
              );

              const uploadRes = await storageProvider.uploadFile(buffer, storagePath, {
                contentType: att.contentType || 'application/octet-stream',
                tenantId: provider.tenantId,
                caseId: '',
                documentId: msg.id,
                fileName: att.name
              });

              processedAttachments.push({
                fileName: att.name,
                mimeType: att.contentType,
                fileSize: att.size,
                storagePath: uploadRes.path
              });
            }
          }
        } catch (e) {
          console.error(`Failed to sync attachments for outlook msg ${msg.id}`, e);
        }
      }

      messages.push({
        messageId: msg.id,
        threadId: msg.conversationId,
        subject: msg.subject,
        from: from,
        to: msg.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
        cc: msg.ccRecipients?.map((r: any) => r.emailAddress?.address) || [],
        bcc: [],
        htmlBody: msg.body?.content || '',
        textBody: msg.body?.content || '',
        receivedAt: new Date(msg.receivedDateTime),
        attachments: processedAttachments
      });
    }

    return messages;
  }
}

export class EmailService {
  private gmail: GmailProvider;
  private outlook: OutlookProvider;

  constructor() {
    this.gmail = new GmailProvider();
    this.outlook = new OutlookProvider();
  }

  async connectProvider(userId: string, provider: string, authCode: string, redirectUri: string) {
    if (provider === 'gmail') return this.gmail.connect(userId, authCode, redirectUri);
    if (provider === 'outlook') return this.outlook.connect(userId, authCode, redirectUri);
    throw new Error(`Invalid provider: ${provider}`);
  }

  async sendEmailViaProvider(providerId: string, emailData: any) {
    const provider = await prisma.emailProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error("Provider not found");

    if (provider.provider === 'gmail') return this.gmail.sendEmail(providerId, emailData);
    if (provider.provider === 'outlook') return this.outlook.sendEmail(providerId, emailData);

    throw new Error(`Unknown provider type: ${provider.provider}`);
  }

  async syncProvider(providerId: string) {
    const provider = await prisma.emailProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error("Provider not found");

    let messages: any[] = [];

    // 1. Fetch normalized emails from provider
    if (provider.provider === 'gmail') {
      messages = await this.gmail.syncInbox(providerId);
    } else if (provider.provider === 'outlook') {
      messages = await this.outlook.syncInbox(providerId);
    }

    let newCount = 0;

    // 2. Persist to DB
    for (const msg of messages) {
      // Check if exists
      const exists = await prisma.email.findUnique({ where: { messageId: msg.messageId } });
      if (exists) continue;

      // Create Email
      const email = await prisma.email.create({
        data: {
          tenantId: provider.tenantId,
          messageId: msg.messageId,
          threadId: msg.threadId,
          subject: msg.subject,
          from: msg.from,
          to: JSON.stringify(msg.to),
          cc: JSON.stringify(msg.cc),
          bcc: JSON.stringify(msg.bcc),
          htmlBody: msg.htmlBody || msg.textBody,
          textBody: msg.textBody,
          receivedAt: msg.receivedAt,
          direction: 'INBOUND',
          status: 'SENT',
          providerId: provider.id,
        }
      });

      // Create Attachments
      if (msg.attachments && msg.attachments.length > 0) {
        await prisma.emailAttachment.createMany({
          data: msg.attachments.map((att: any) => ({
            emailId: email.id,
            fileName: att.fileName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            storagePath: att.storagePath
          }))
        });
      }

      // Link to Lead
      try {
        await convertEmailToLead({
          id: email.id,
          from: msg.from,
          subject: msg.subject,
          htmlBody: msg.htmlBody,
          tenantId: provider.tenantId
        });
      } catch (e) {
        console.error('Failed to link/convert email to lead', e);
      }

      newCount++;
    }

    // Update last sync
    await prisma.emailProvider.update({
      where: { id: providerId },
      data: { lastSyncAt: new Date() }
    });

    return { count: newCount };
  }
}
