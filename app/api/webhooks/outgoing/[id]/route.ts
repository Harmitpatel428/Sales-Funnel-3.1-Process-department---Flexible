import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { WebhookManager } from '@/lib/webhooks/manager';
import { prisma } from '@/lib/db';

// GET /api/webhooks/outgoing/[id] - Get subscription details
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const subscription = await prisma.webhookSubscription.findFirst({
            where: { id, tenantId: session.tenantId },
            include: {
                deliveries: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

        if (!subscription) {
            return NextResponse.json(
                { success: false, message: 'Webhook subscription not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                ...subscription,
                events: JSON.parse(subscription.events),
                authConfig: undefined, // Don't expose auth config
            },
        });
    } catch (error: any) {
        console.error('Error fetching webhook subscription:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch webhook subscription' },
            { status: 500 }
        );
    }
}

// PATCH /api/webhooks/outgoing/[id] - Update subscription
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();

        const updated = await WebhookManager.updateSubscription(id, session.tenantId, body);

        if (!updated) {
            return NextResponse.json(
                { success: false, message: 'Webhook subscription not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Webhook subscription updated successfully',
        });
    } catch (error: any) {
        console.error('Error updating webhook subscription:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to update webhook subscription' },
            { status: 500 }
        );
    }
}

// DELETE /api/webhooks/outgoing/[id] - Delete subscription
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const deleted = await WebhookManager.unsubscribe(id, session.tenantId);

        if (!deleted) {
            return NextResponse.json(
                { success: false, message: 'Webhook subscription not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Webhook subscription deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting webhook subscription:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete webhook subscription' },
            { status: 500 }
        );
    }
}
