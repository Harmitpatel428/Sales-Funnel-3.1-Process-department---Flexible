import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { EmailService } from '@/lib/email-service';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';

const emailService = new EmailService();

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: false, rateLimit: 50 },
    async (req: NextRequest, context) => {
        const provider = context.params.provider;

        if (provider === 'gmail') {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GMAIL_CLIENT_ID,
                process.env.GMAIL_CLIENT_SECRET,
                process.env.GMAIL_REDIRECT_URI
            );

            const scopes = [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/userinfo.email'
            ];

            const url = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: scopes,
                prompt: 'consent', // Force refresh token
                state: context.session.userId // naive state
            });

            return NextResponse.json({ url });
        } else if (provider === 'outlook') {
            // Outlook generation
            const clientId = process.env.OUTLOOK_CLIENT_ID;
            const redirectUri = process.env.OUTLOOK_REDIRECT_URI!;
            const scopes = ["User.Read", "Mail.ReadWrite", "Mail.Send", "offline_access"];

            const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scopes.join(' '))}&state=${context.session.userId}`;

            return NextResponse.json({ url });
        }

        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
);

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 50 },
    async (req: NextRequest, context) => {
        const provider = context.params.provider;
        const body = await req.json();
        const { code, redirectUri } = z.object({ code: z.string(), redirectUri: z.string().optional() }).parse(body);

        const emailProvider = await emailService.connectProvider(
            context.session.userId,
            provider,
            code,
            redirectUri || process.env.GMAIL_REDIRECT_URI! // Fallback to env
        );

        return NextResponse.json(emailProvider);
    }
);

