import crypto from 'crypto';
import { prisma } from '../db';

// In-memory store for authorization codes (use Redis in production)
const authCodeStore = new Map<string, {
    clientId: string;
    userId: string;
    scopes: string[];
    redirectUri: string;
    expiresAt: number;
}>();

export async function createOAuthClient(
    tenantId: string,
    name: string,
    redirectUris: string[],
    scopes: string[],
    options?: {
        description?: string;
        logoUrl?: string;
        websiteUrl?: string;
        privacyUrl?: string;
        termsUrl?: string;
        isPublic?: boolean;
    }
): Promise<{ clientId: string; clientSecret: string }> {
    const clientId = `client_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = crypto.createHash('sha256').update(clientSecret).digest('hex');

    await prisma.oAuthClient.create({
        data: {
            clientId,
            clientSecret: hashedSecret,
            name,
            tenantId,
            redirectUris: JSON.stringify(redirectUris),
            scopes: JSON.stringify(scopes),
            grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
            description: options?.description,
            logoUrl: options?.logoUrl,
            websiteUrl: options?.websiteUrl,
            privacyUrl: options?.privacyUrl,
            termsUrl: options?.termsUrl,
            isPublic: options?.isPublic || false,
        },
    });

    return { clientId, clientSecret };
}

export async function validateOAuthClient(
    clientId: string,
    redirectUri: string
): Promise<{ valid: boolean; client?: any; error?: string }> {
    const client = await prisma.oAuthClient.findUnique({
        where: { clientId },
        include: { tenant: true },
    });

    if (!client) {
        return { valid: false, error: 'Client not found' };
    }

    if (!client.isActive) {
        return { valid: false, error: 'Client is inactive' };
    }

    const redirectUris = JSON.parse(client.redirectUris) as string[];
    if (!redirectUris.includes(redirectUri)) {
        return { valid: false, error: 'Invalid redirect URI' };
    }

    return { valid: true, client };
}

export async function generateAuthorizationCode(
    clientId: string,
    userId: string,
    scopes: string[],
    redirectUri: string
): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');

    authCodeStore.set(code, {
        clientId,
        userId,
        scopes,
        redirectUri,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // Clean up expired codes periodically
    setTimeout(() => {
        authCodeStore.delete(code);
    }, 10 * 60 * 1000);

    return code;
}

export async function exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
    scope: string;
} | null> {
    const authData = authCodeStore.get(code);

    if (!authData) {
        return null;
    }

    if (authData.expiresAt < Date.now()) {
        authCodeStore.delete(code);
        return null;
    }

    if (authData.clientId !== clientId) {
        return null;
    }

    if (authData.redirectUri !== redirectUri) {
        return null;
    }

    // Verify client secret
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return null;

    const hashedSecret = crypto.createHash('sha256').update(clientSecret).digest('hex');
    if (client.clientSecret !== hashedSecret) return null;

    // Generate tokens
    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.oAuthToken.create({
        data: {
            clientId: client.id,
            userId: authData.userId,
            accessToken,
            refreshToken,
            scopes: JSON.stringify(authData.scopes),
            expiresAt,
        },
    });

    // Delete the used authorization code
    authCodeStore.delete(code);

    return {
        accessToken,
        refreshToken,
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: authData.scopes.join(' '),
    };
}

export async function refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
} | null> {
    // Verify client
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return null;

    const hashedSecret = crypto.createHash('sha256').update(clientSecret).digest('hex');
    if (client.clientSecret !== hashedSecret) return null;

    // Find the token
    const token = await prisma.oAuthToken.findUnique({
        where: { refreshToken },
    });

    if (!token || token.clientId !== client.id) {
        return null;
    }

    // Generate new tokens
    const newAccessToken = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Update token record
    await prisma.oAuthToken.update({
        where: { id: token.id },
        data: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresAt,
        },
    });

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
        tokenType: 'Bearer',
    };
}

export async function validateAccessToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    scopes?: string[];
    clientId?: string;
}> {
    const oauthToken = await prisma.oAuthToken.findUnique({
        where: { accessToken: token },
        include: { user: true, client: true },
    });

    if (!oauthToken) {
        return { valid: false };
    }

    if (oauthToken.expiresAt < new Date()) {
        return { valid: false };
    }

    return {
        valid: true,
        userId: oauthToken.userId,
        scopes: JSON.parse(oauthToken.scopes),
        clientId: oauthToken.client.clientId,
    };
}

export async function revokeToken(token: string): Promise<boolean> {
    try {
        // Try to find by access token first
        let oauthToken = await prisma.oAuthToken.findUnique({
            where: { accessToken: token },
        });

        // If not found, try refresh token
        if (!oauthToken) {
            oauthToken = await prisma.oAuthToken.findUnique({
                where: { refreshToken: token },
            });
        }

        if (oauthToken) {
            await prisma.oAuthToken.delete({
                where: { id: oauthToken.id },
            });
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

export async function getClientById(clientId: string) {
    return prisma.oAuthClient.findUnique({
        where: { clientId },
        select: {
            id: true,
            clientId: true,
            name: true,
            description: true,
            logoUrl: true,
            websiteUrl: true,
            privacyUrl: true,
            termsUrl: true,
            redirectUris: true,
            scopes: true,
            isActive: true,
            isPublic: true,
        },
    });
}

// OAuth scopes for third-party apps
export const OAUTH_SCOPES = {
    READ_LEADS: 'read:leads',
    WRITE_LEADS: 'write:leads',
    READ_CASES: 'read:cases',
    WRITE_CASES: 'write:cases',
    READ_DOCUMENTS: 'read:documents',
    WRITE_DOCUMENTS: 'write:documents',
    READ_PROFILE: 'read:profile',
    READ_REPORTS: 'read:reports',
} as const;

export const OAUTH_SCOPE_DESCRIPTIONS: Record<string, string> = {
    'read:leads': 'Read your leads',
    'write:leads': 'Create and update leads',
    'read:cases': 'Read your cases',
    'write:cases': 'Create and update cases',
    'read:documents': 'Read your documents',
    'write:documents': 'Upload and manage documents',
    'read:profile': 'Read your profile information',
    'read:reports': 'Access reports and analytics',
};
