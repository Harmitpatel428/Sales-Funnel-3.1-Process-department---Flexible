import { prisma } from '../db';

interface WebhookAuthConfig {
    type: 'API_KEY' | 'BEARER' | 'HMAC';
    apiKey?: string;
    bearerToken?: string;
    hmacSecret?: string;
}

export class WebhookManager {
    /**
     * Subscribe to webhook events
     */
    static async subscribe(
        tenantId: string,
        url: string,
        events: string[],
        authConfig?: WebhookAuthConfig,
        options?: {
            maxRetries?: number;
            retryDelay?: number;
        }
    ): Promise<string> {
        const subscription = await prisma.webhookSubscription.create({
            data: {
                tenantId,
                url,
                events: JSON.stringify(events),
                authType: authConfig?.type || 'API_KEY',
                authConfig: authConfig ? JSON.stringify(authConfig) : null,
                maxRetries: options?.maxRetries || 3,
                retryDelay: options?.retryDelay || 1000,
            },
        });
        return subscription.id;
    }

    /**
     * Unsubscribe from webhook events
     */
    static async unsubscribe(subscriptionId: string, tenantId: string): Promise<boolean> {
        const subscription = await prisma.webhookSubscription.findFirst({
            where: { id: subscriptionId, tenantId },
        });

        if (!subscription) return false;

        await prisma.webhookSubscription.delete({
            where: { id: subscriptionId },
        });

        return true;
    }

    /**
     * Update webhook subscription
     */
    static async updateSubscription(
        subscriptionId: string,
        tenantId: string,
        updates: {
            url?: string;
            events?: string[];
            isActive?: boolean;
            authConfig?: WebhookAuthConfig;
        }
    ): Promise<boolean> {
        const subscription = await prisma.webhookSubscription.findFirst({
            where: { id: subscriptionId, tenantId },
        });

        if (!subscription) return false;

        await prisma.webhookSubscription.update({
            where: { id: subscriptionId },
            data: {
                url: updates.url,
                events: updates.events ? JSON.stringify(updates.events) : undefined,
                isActive: updates.isActive,
                authConfig: updates.authConfig ? JSON.stringify(updates.authConfig) : undefined,
            },
        });

        return true;
    }

    /**
     * Trigger webhooks for an event
     */
    static async triggerWebhooks(
        tenantId: string,
        event: string,
        payload: any
    ): Promise<void> {
        const subscriptions = await prisma.webhookSubscription.findMany({
            where: {
                tenantId,
                isActive: true,
            },
        });

        for (const sub of subscriptions) {
            const events = JSON.parse(sub.events) as string[];
            if (!events.includes(event) && !events.includes('*')) continue;

            const authConfig = sub.authConfig ? JSON.parse(sub.authConfig) : undefined;

            const delivery = await prisma.webhookDelivery.create({
                data: {
                    subscriptionId: sub.id,
                    event,
                    payload: JSON.stringify(payload),
                    status: 'PENDING',
                },
            });

            // Send webhook asynchronously (don't await)
            this.deliverWebhook(delivery.id, sub.url, event, payload, authConfig, sub.maxRetries);
        }
    }

    /**
     * Deliver a webhook
     */
    private static async deliverWebhook(
        deliveryId: string,
        url: string,
        event: string,
        payload: any,
        authConfig?: WebhookAuthConfig,
        maxRetries: number = 3
    ): Promise<void> {
        let attempts = 0;
        let success = false;
        let statusCode: number | undefined;
        let response: string | undefined;
        let error: string | undefined;

        while (attempts < maxRetries && !success) {
            attempts++;

            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'X-Webhook-Event': event,
                    'X-Webhook-Delivery-Id': deliveryId,
                    'X-Webhook-Timestamp': new Date().toISOString(),
                };

                // Add authentication headers
                if (authConfig) {
                    switch (authConfig.type) {
                        case 'API_KEY':
                            if (authConfig.apiKey) {
                                headers['X-API-Key'] = authConfig.apiKey;
                            }
                            break;
                        case 'BEARER':
                            if (authConfig.bearerToken) {
                                headers['Authorization'] = `Bearer ${authConfig.bearerToken}`;
                            }
                            break;
                        case 'HMAC':
                            if (authConfig.hmacSecret) {
                                const crypto = await import('crypto');
                                const signature = crypto
                                    .createHmac('sha256', authConfig.hmacSecret)
                                    .update(JSON.stringify({ event, data: payload }))
                                    .digest('hex');
                                headers['X-Webhook-Signature'] = `sha256=${signature}`;
                            }
                            break;
                    }
                }

                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        event,
                        data: payload,
                        timestamp: new Date().toISOString(),
                        deliveryId,
                    }),
                });

                statusCode = res.status;
                response = await res.text();
                success = res.ok;

                if (!success && attempts < maxRetries) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
                }
            } catch (err: any) {
                error = err.message;
                if (attempts < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
                }
            }
        }

        // Update delivery record
        await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
                status: success ? 'SUCCESS' : 'FAILED',
                statusCode,
                response: response?.substring(0, 1000), // Limit response size
                error,
                attempts,
                deliveredAt: success ? new Date() : null,
                nextRetryAt: !success ? new Date(Date.now() + 60000) : null,
            },
        });
    }

    /**
     * Get webhook deliveries for a subscription
     */
    static async getDeliveries(
        subscriptionId: string,
        tenantId: string,
        options?: {
            limit?: number;
            offset?: number;
            status?: string;
        }
    ): Promise<any[]> {
        // Verify subscription belongs to tenant
        const subscription = await prisma.webhookSubscription.findFirst({
            where: { id: subscriptionId, tenantId },
        });

        if (!subscription) return [];

        return prisma.webhookDelivery.findMany({
            where: {
                subscriptionId,
                status: options?.status,
            },
            orderBy: { createdAt: 'desc' },
            take: options?.limit || 50,
            skip: options?.offset || 0,
        });
    }

    /**
     * Retry a failed delivery
     */
    static async retryDelivery(deliveryId: string, tenantId: string): Promise<boolean> {
        const delivery = await prisma.webhookDelivery.findUnique({
            where: { id: deliveryId },
            include: { subscription: true },
        });

        if (!delivery || delivery.subscription.tenantId !== tenantId) {
            return false;
        }

        if (delivery.status === 'SUCCESS') {
            return false; // Can't retry successful deliveries
        }

        const authConfig = delivery.subscription.authConfig
            ? JSON.parse(delivery.subscription.authConfig)
            : undefined;

        // Reset status and retry
        await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: { status: 'PENDING', attempts: 0 },
        });

        this.deliverWebhook(
            deliveryId,
            delivery.subscription.url,
            delivery.event,
            JSON.parse(delivery.payload),
            authConfig,
            delivery.subscription.maxRetries
        );

        return true;
    }
}

// Available webhook events
export const WEBHOOK_EVENTS = [
    'lead.created',
    'lead.updated',
    'lead.deleted',
    'lead.status_changed',
    'lead.assigned',
    'case.created',
    'case.updated',
    'case.status_changed',
    'case.assigned',
    'document.uploaded',
    'document.verified',
    'document.rejected',
    'workflow.started',
    'workflow.completed',
    'workflow.failed',
    'approval.requested',
    'approval.approved',
    'approval.rejected',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
