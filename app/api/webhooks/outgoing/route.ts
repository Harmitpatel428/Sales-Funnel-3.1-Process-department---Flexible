import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { WebhookManager, WEBHOOK_EVENTS } from '@/lib/webhooks/manager';
import { prisma } from '@/lib/db';

// GET /api/webhooks/outgoing - List webhook subscriptions
export async function GET(req: NextRequest) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const subscriptions = await prisma.webhookSubscription.findMany({
            where: { tenantId: session.tenantId },
            select: {
                id: true,
                url: true,
                events: true,
                authType: true,
                isActive: true,
                maxRetries: true,
                retryDelay: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: { deliveries: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const formattedSubscriptions = subscriptions.map(sub => ({
            ...sub,
            events: JSON.parse(sub.events),
            totalDeliveries: sub._count.deliveries,
        }));

        return NextResponse.json({
            success: true,
            data: formattedSubscriptions,
            meta: {
                availableEvents: WEBHOOK_EVENTS,
            },
        });
    } catch (error: any) {
        console.error('Error fetching webhook subscriptions:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch webhook subscriptions' },
            { status: 500 }
        );
    }
}

// POST /api/webhooks/outgoing - Create webhook subscription
export async function POST(req: NextRequest) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { url, events, authType, authConfig, maxRetries, retryDelay } = body;

        // Validate URL
        if (!url || typeof url !== 'string') {
            return NextResponse.json(
                { success: false, message: 'URL is required' },
                { status: 400 }
            );
        }

        try {
            new URL(url);
        } catch {
            return NextResponse.json(
                { success: false, message: 'Invalid URL format' },
                { status: 400 }
            );
        }

        // Validate events
        if (!events || !Array.isArray(events) || events.length === 0) {
            return NextResponse.json(
                { success: false, message: 'At least one event is required' },
                { status: 400 }
            );
        }

        const invalidEvents = events.filter((e: string) =>
            e !== '*' && !WEBHOOK_EVENTS.includes(e as any)
        );
        if (invalidEvents.length > 0) {
            return NextResponse.json(
                { success: false, message: `Invalid events: ${invalidEvents.join(', ')}` },
                { status: 400 }
            );
        }

        const subscriptionId = await WebhookManager.subscribe(
            session.tenantId,
            url,
            events,
            authConfig ? { type: authType || 'API_KEY', ...authConfig } : undefined,
            { maxRetries, retryDelay }
        );

        const subscription = await prisma.webhookSubscription.findUnique({
            where: { id: subscriptionId },
        });

        return NextResponse.json({
            success: true,
            data: {
                ...subscription,
                events: JSON.parse(subscription!.events),
            },
            message: 'Webhook subscription created successfully',
        }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating webhook subscription:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create webhook subscription' },
            { status: 500 }
        );
    }
}
