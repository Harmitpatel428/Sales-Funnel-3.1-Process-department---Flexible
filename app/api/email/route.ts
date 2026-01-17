import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '@/lib/email-service';
import { injectTrackingPixel, wrapLinksWithTracking } from '@/lib/email-tracking';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { PERMISSIONS } from '@/app/types/permissions';
import { requirePermissions } from '@/lib/utils/permissions';

const prisma = new PrismaClient();
const emailService = new EmailService();

export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requirePermissions(session.user.id as string, [PERMISSIONS.EMAIL_VIEW]))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');
    const caseId = searchParams.get('caseId');
    const threadId = searchParams.get('threadId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = {
        tenantId: (await prisma.user.findUnique({ where: { id: session.user.id as string } }))?.tenantId
    };

    if (leadId) where.leadId = leadId;
    if (caseId) where.caseId = caseId;
    if (threadId) where.threadId = threadId;

    const emails = await prisma.email.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { attachments: true }
    });

    return NextResponse.json(emails);
}

export async function POST(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requirePermissions(session.user.id as string, [PERMISSIONS.EMAIL_SEND]))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const schema = z.object({
            to: z.union([z.string(), z.array(z.string())]),
            cc: z.union([z.string(), z.array(z.string())]).optional(),
            bcc: z.union([z.string(), z.array(z.string())]).optional(),
            subject: z.string(),
            htmlBody: z.string(),
            providerId: z.string().optional(),
            leadId: z.string().optional(),
            caseId: z.string().optional(),
            replyToEmailId: z.string().optional()
        });

        const data = schema.parse(body);

        // Normalize recipients to arrays or strings as needed by your models
        const toList = Array.isArray(data.to) ? data.to : [data.to];
        const ccList = Array.isArray(data.cc) ? data.cc : (data.cc ? [data.cc] : []);
        const bccList = Array.isArray(data.bcc) ? data.bcc : (data.bcc ? [data.bcc] : []);

        const tenantId = (await prisma.user.findUnique({ where: { id: session.user.id as string } }))?.tenantId!;

        // Check Permissions if using a provider (implied advanced feature)
        // Or generally for sending emails
        // For now, let's assume basic robust check:
        // const hasPerm = await checkPermission(session.user.id, PERMISSIONS.EMAIL_SEND);
        // if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const trackingPixelId = uuidv4();
        let finalHtml = injectTrackingPixel(data.htmlBody, trackingPixelId);

        // Create preliminary email record
        const email = await prisma.email.create({
            data: {
                tenantId,
                subject: data.subject,
                to: JSON.stringify(toList),
                cc: JSON.stringify(ccList),
                bcc: JSON.stringify(bccList),
                from: session.user.email,
                direction: 'OUTBOUND',
                status: 'SENDING',
                htmlBody: finalHtml,
                leadId: data.leadId,
                caseId: data.caseId,
                trackingPixelId,
                sentById: session.user.id as string,
                providerId: data.providerId,
                messageId: uuidv4(), // Temporary
            }
        });

        finalHtml = wrapLinksWithTracking(finalHtml, email.id);
        await prisma.email.update({ where: { id: email.id }, data: { htmlBody: finalHtml } });

        // Send
        let providerResult;
        if (data.providerId) {
            providerResult = await emailService.sendEmailViaProvider(data.providerId, {
                to: toList.join(','),
                cc: ccList.join(','),
                bcc: bccList.join(','),
                subject: data.subject,
                htmlBody: finalHtml
            });
        } else {
            // Fallback to Nodemailer
            providerResult = await sendEmail({
                to: toList.join(','), // Nodemailer accepts comma separated
                subject: data.subject,
                html: finalHtml
            });
            if (!providerResult.success) {
                throw new Error(providerResult.error || 'Nodemailer failed');
            }
            // providerResult might contain messageId
        }

        // Update status
        await prisma.email.update({
            where: { id: email.id },
            data: {
                status: 'SENT',
                sentAt: new Date(),
                providerMessageId: providerResult.id || providerResult.messageId
            }
        });

        return NextResponse.json(email);

    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
