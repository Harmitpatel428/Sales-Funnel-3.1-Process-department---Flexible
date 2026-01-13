import crypto from 'crypto';
import { prisma } from './db';

export async function generateApiKey(
    tenantId: string,
    userId: string,
    name: string,
    scopes: string[],
    options?: {
        rateLimit?: number;
        expiresAt?: Date;
        environment?: 'production' | 'sandbox';
        description?: string;
    }
): Promise<{ key: string; keyPrefix: string; id: string }> {
    // Generate secure random key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = `sk_${options?.environment === 'sandbox' ? 'test' : 'live'}_${rawKey.substring(0, 8)}`;
    const fullKey = `${keyPrefix}${rawKey.substring(8)}`;

    // Hash key for storage
    const hashedKey = await hashApiKey(fullKey);

    // Create API key record
    const apiKey = await prisma.apiKey.create({
        data: {
            name,
            key: hashedKey,
            keyPrefix,
            tenantId,
            userId,
            scopes: JSON.stringify(scopes),
            rateLimit: options?.rateLimit || 1000,
            expiresAt: options?.expiresAt,
            environment: options?.environment || 'production',
            description: options?.description,
        },
    });

    return { key: fullKey, keyPrefix, id: apiKey.id };
}

async function hashApiKey(key: string): Promise<string> {
    return crypto.createHash('sha256').update(key).digest('hex');
}

export async function validateApiKey(key: string): Promise<{
    valid: boolean;
    apiKey?: any;
    tenant?: any;
    scopes?: string[];
}> {
    const hashedKey = await hashApiKey(key);

    const apiKey = await prisma.apiKey.findUnique({
        where: { key: hashedKey },
        include: { tenant: true, user: true },
    });

    if (!apiKey || !apiKey.isActive) {
        return { valid: false };
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return { valid: false };
    }

    // Update last used timestamp
    await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
    });

    return {
        valid: true,
        apiKey,
        tenant: apiKey.tenant,
        scopes: JSON.parse(apiKey.scopes),
    };
}

export async function checkApiKeyRateLimit(apiKeyId: string): Promise<boolean> {
    const apiKey = await prisma.apiKey.findUnique({
        where: { id: apiKeyId },
    });

    if (!apiKey) return false;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const usageCount = await prisma.apiUsageLog.count({
        where: {
            apiKeyId,
            timestamp: { gte: oneHourAgo },
        },
    });

    return usageCount < apiKey.rateLimit;
}

export async function logApiUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    ipAddress?: string,
    userAgent?: string,
    requestSize?: number,
    responseSize?: number
): Promise<void> {
    await prisma.apiUsageLog.create({
        data: {
            apiKeyId,
            endpoint,
            method,
            statusCode,
            responseTime,
            ipAddress,
            userAgent,
            requestSize,
            responseSize,
        },
    });
}

export async function revokeApiKey(id: string, tenantId: string): Promise<boolean> {
    const apiKey = await prisma.apiKey.findFirst({
        where: { id, tenantId },
    });

    if (!apiKey) return false;

    await prisma.apiKey.update({
        where: { id },
        data: { isActive: false },
    });

    return true;
}

export async function rotateApiKey(
    id: string,
    tenantId: string
): Promise<{ key: string; keyPrefix: string } | null> {
    const apiKey = await prisma.apiKey.findFirst({
        where: { id, tenantId },
    });

    if (!apiKey) return null;

    // Generate new key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = `sk_${apiKey.environment === 'sandbox' ? 'test' : 'live'}_${rawKey.substring(0, 8)}`;
    const fullKey = `${keyPrefix}${rawKey.substring(8)}`;
    const hashedKey = await hashApiKey(fullKey);

    // Update with new key
    await prisma.apiKey.update({
        where: { id },
        data: {
            key: hashedKey,
            keyPrefix,
        },
    });

    return { key: fullKey, keyPrefix };
}

export async function getApiKeyUsageStats(
    apiKeyId: string,
    days: number = 30
): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    topEndpoints: { endpoint: string; count: number }[];
}> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await prisma.apiUsageLog.findMany({
        where: {
            apiKeyId,
            timestamp: { gte: startDate },
        },
    });

    const totalRequests = logs.length;
    const successfulRequests = logs.filter(l => l.statusCode >= 200 && l.statusCode < 400).length;
    const failedRequests = logs.filter(l => l.statusCode >= 400).length;
    const avgResponseTime = totalRequests > 0
        ? logs.reduce((sum, l) => sum + l.responseTime, 0) / totalRequests
        : 0;

    // Calculate top endpoints
    const endpointCounts = logs.reduce((acc, l) => {
        acc[l.endpoint] = (acc[l.endpoint] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const topEndpoints = Object.entries(endpointCounts)
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalRequests,
        successfulRequests,
        failedRequests,
        avgResponseTime,
        topEndpoints,
    };
}

// Define available API scopes
export const API_SCOPES = {
    LEADS_READ: 'leads:read',
    LEADS_WRITE: 'leads:write',
    LEADS_DELETE: 'leads:delete',
    CASES_READ: 'cases:read',
    CASES_WRITE: 'cases:write',
    CASES_DELETE: 'cases:delete',
    DOCUMENTS_READ: 'documents:read',
    DOCUMENTS_WRITE: 'documents:write',
    DOCUMENTS_DELETE: 'documents:delete',
    USERS_READ: 'users:read',
    USERS_WRITE: 'users:write',
    REPORTS_READ: 'reports:read',
    WEBHOOKS_READ: 'webhooks:read',
    WEBHOOKS_WRITE: 'webhooks:write',
    INTEGRATIONS_READ: 'integrations:read',
    INTEGRATIONS_WRITE: 'integrations:write',
    ADMIN: 'admin',
} as const;

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
    'leads:read': 'Read access to leads',
    'leads:write': 'Create and update leads',
    'leads:delete': 'Delete leads',
    'cases:read': 'Read access to cases',
    'cases:write': 'Create and update cases',
    'cases:delete': 'Delete cases',
    'documents:read': 'Read access to documents',
    'documents:write': 'Upload and update documents',
    'documents:delete': 'Delete documents',
    'users:read': 'Read access to user information',
    'users:write': 'Create and update users',
    'reports:read': 'Read access to reports and analytics',
    'webhooks:read': 'Read webhook subscriptions',
    'webhooks:write': 'Create and manage webhook subscriptions',
    'integrations:read': 'Read integration settings',
    'integrations:write': 'Install and configure integrations',
    'admin': 'Full administrative access',
};
