import { NextRequest, NextResponse } from 'next/server';
import { WebhookManager } from '@/lib/webhooks/manager';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/webhooks/outgoing/[id]
 * Get subscription details
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
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
            return notFoundResponse('Webhook subscription');
        }

        return NextResponse.json({
            success: true,
            data: {
                ...subscription,
                events: JSON.parse(subscription.events),
                authConfig: undefined, // Don't expose auth config
            },
        });
    }
);

/**
 * PATCH /api/webhooks/outgoing/[id]
 * Update subscription
 */
export const PATCH = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await req.json();

        const updated = await WebhookManager.updateSubscription(id, session.tenantId, body);

        if (!updated) {
            return notFoundResponse('Webhook subscription');
        }

        return NextResponse.json({
            success: true,
            message: 'Webhook subscription updated successfully',
        });
    }
);

/**
 * DELETE /api/webhooks/outgoing/[id]
 * Delete subscription
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const deleted = await WebhookManager.unsubscribe(id, session.tenantId);

        if (!deleted) {
            return notFoundResponse('Webhook subscription');
        }

        return NextResponse.json({
            success: true,
            message: 'Webhook subscription deleted successfully',
        });
    }
);
