import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { convertEmailToLead } from '@/lib/email-to-lead';
import { z } from 'zod';

// Inbound Parse Webhook (e.g., from SendGrid/Mailgun if used, or internal manual parse)
// The user asked for /api/email/parse/ to accept raw email data and convert to lead/case.
export async function POST(req: NextRequest) {
    // Basic API Key or Session auth?
    // Since this might be called by an external webhook, we might check a secret header.
    // Or if internal, session.
    // Plan says "Implement /app/api/email/parse/route.ts POST: Accept raw email data... return created Lead/Case ID."
    // Assuming internal use for now or protected.

    // For manual testing/internal parsing:
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Use real tenant ID
    try {
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
            tenantId: user.tenantId
        } as any;

        const result = await convertEmailToLead(mockEmail);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Parse error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
