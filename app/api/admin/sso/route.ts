import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/admin/sso
 * List SSO providers (ADMIN only)
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_MANAGE_SSO]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const providers = await prisma.sso_providers.findMany({
            where: { tenantId: session.tenantId },
        });

        return NextResponse.json({ success: true, data: providers });
    }
);

/**
 * POST /api/admin/sso
 * Create SSO provider (ADMIN only)
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_MANAGE_SSO]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const data = await req.json();

        // Basic validation
        const errors: { field: string; message: string; code: string }[] = [];
        if (!data.name) {
            errors.push({ field: 'name', message: 'Name is required', code: 'required' });
        }
        if (!data.type) {
            errors.push({ field: 'type', message: 'Type is required', code: 'required' });
        }
        if (errors.length > 0) {
            return validationErrorResponse(errors);
        }

        const provider = await prisma.sso_providers.create({
            data: {
                tenantId: session.tenantId,
                name: data.name,
                type: data.type,
                metadataUrl: data.metadataUrl,
                clientId: data.clientId,
                clientSecret: data.clientSecret,
                issuer: data.issuer,
                acsUrl: data.acsUrl,
                entityId: data.entityId,
                authorizationUrl: data.authorizationUrl,
                tokenUrl: data.tokenUrl,
                userInfoUrl: data.userInfoUrl,
            }
        });

        return NextResponse.json({ success: true, data: provider });
    }
);

/**
 * PUT /api/admin/sso
 * Update SSO provider (ADMIN only)
 */
export const PUT = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_MANAGE_SSO]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const data = await req.json();
        if (!data.id) {
            return validationErrorResponse([
                { field: 'id', message: 'ID is required', code: 'required' }
            ]);
        }

        // Ensure we only update if belongs to tenant
        const existing = await prisma.sso_providers.findUnique({
            where: { id: data.id }
        });

        if (!existing || existing.tenantId !== session.tenantId) {
            return notFoundResponse('Provider');
        }

        const provider = await prisma.sso_providers.update({
            where: { id: data.id },
            data: {
                name: data.name,
                type: data.type,
                metadataUrl: data.metadataUrl,
                clientId: data.clientId,
                clientSecret: data.clientSecret,
                issuer: data.issuer,
                acsUrl: data.acsUrl,
                entityId: data.entityId,
                authorizationUrl: data.authorizationUrl,
                tokenUrl: data.tokenUrl,
                userInfoUrl: data.userInfoUrl,
            }
        });

        return NextResponse.json({ success: true, data: provider });
    }
);

/**
 * DELETE /api/admin/sso
 * Delete SSO provider (ADMIN only)
 */
export const DELETE = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_MANAGE_SSO]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return validationErrorResponse([
                { field: 'id', message: 'ID is required', code: 'required' }
            ]);
        }

        // Ensure we only delete if belongs to tenant
        const existing = await prisma.sso_providers.findUnique({
            where: { id }
        });

        if (!existing || existing.tenantId !== session.tenantId) {
            return notFoundResponse('Provider');
        }

        await prisma.sso_providers.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    }
);
