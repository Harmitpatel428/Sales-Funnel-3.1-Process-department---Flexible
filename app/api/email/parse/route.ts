import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { convertEmailToLead } from '@/lib/email-to-lead';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';

// Inbound Parse Webhook (e.g., from SendGrid/Mailgun if used, or internal manual parse)
// The user asked for /api/email/parse/ to accept raw email data and convert to lead/case.
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        // Use real tenant ID
        const body = await req.json();
        const schema = z.object({
            subject: z.string().optional(),
            from: z.string(),
            to: z.string().optional(),
            textBody: z.string().optional(),
            htmlBody: z.string().optional(),
            receivedAt: z.string().optional(), // ISO date
            messageId: z.string().optional()
        });

        const data = schema.parse(body);

        // Use real tenant ID
        const mockEmail = {
            id: 'temp-' + Date.now(),
            subject: data.subject || '',
            from: data.from,
            to: data.to || '',
            textBody: data.textBody || '',
            htmlBody: data.htmlBody || '',
            receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
            messageId: data.messageId || 'manual-' + Date.now(),
            tenantId: context.session.tenantId
        } as any;

        const result = await convertEmailToLead(mockEmail);

        return NextResponse.json(result);
    }
);

