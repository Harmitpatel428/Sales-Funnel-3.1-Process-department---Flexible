/**
 * Webhook Handler
 * Manages outgoing webhook requests with retry and authentication
 */

export interface WebhookAuth {
    type: 'API_KEY' | 'BEARER' | 'BASIC' | 'HMAC';
    apiKey?: string;
    apiKeyHeader?: string;
    token?: string;
    username?: string;
    password?: string;
    hmacSecret?: string;
}

export interface WebhookConfig {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    authentication?: WebhookAuth;
    timeout?: number;
}

export interface WebhookResult {
    success: boolean;
    statusCode?: number;
    response?: unknown;
    error?: string;
    attempts: number;
}

export class WebhookHandler {
    private static readonly MAX_RETRIES = 3;
    private static readonly TIMEOUT = 30000;

    static async sendWebhook(config: WebhookConfig, attempt: number = 1): Promise<WebhookResult> {
        const headers: Record<string, string> = { ...config.headers };

        if (config.authentication) {
            this.applyAuthentication(headers, config.authentication, config.body);
        }

        let body: string | undefined;
        if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            body = JSON.stringify(config.body);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout || this.TIMEOUT);

            const response = await fetch(config.url, {
                method: config.method,
                headers,
                body,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseData = await response.text().then(text => {
                try { return JSON.parse(text); } catch { return text; }
            });

            if (!response.ok && attempt < this.MAX_RETRIES) {
                await this.delay(1000 * Math.pow(2, attempt));
                return this.sendWebhook(config, attempt + 1);
            }

            return {
                success: response.ok,
                statusCode: response.status,
                response: responseData,
                attempts: attempt
            };
        } catch (error) {
            if (attempt < this.MAX_RETRIES) {
                await this.delay(1000 * Math.pow(2, attempt));
                return this.sendWebhook(config, attempt + 1);
            }
            return {
                success: false,
                error: (error as Error).message,
                attempts: attempt
            };
        }
    }

    private static applyAuthentication(
        headers: Record<string, string>,
        auth: WebhookAuth,
        body?: Record<string, unknown>
    ): void {
        switch (auth.type) {
            case 'API_KEY':
                headers[auth.apiKeyHeader || 'X-API-Key'] = auth.apiKey || '';
                break;
            case 'BEARER':
                headers['Authorization'] = `Bearer ${auth.token}`;
                break;
            case 'BASIC':
                const creds = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
                headers['Authorization'] = `Basic ${creds}`;
                break;
            case 'HMAC':
                if (auth.hmacSecret && body) {
                    const crypto = require('crypto');
                    const signature = crypto
                        .createHmac('sha256', auth.hmacSecret)
                        .update(JSON.stringify(body))
                        .digest('hex');
                    headers['X-Signature'] = signature;
                }
                break;
        }
    }

    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static buildPayload(
        entityType: string,
        entityData: Record<string, unknown>,
        triggerData: Record<string, unknown>,
        workflowContext: Record<string, unknown>
    ): Record<string, unknown> {
        return {
            event: {
                type: `workflow.${entityType.toLowerCase()}`,
                timestamp: new Date().toISOString()
            },
            entity: this.sanitizePayload(entityData),
            trigger: triggerData,
            context: workflowContext
        };
    }

    private static sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
        const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'encryptionKey'];
        const sanitized = { ...data };
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '[REDACTED]';
            }
        }
        return sanitized;
    }
}

export default WebhookHandler;
