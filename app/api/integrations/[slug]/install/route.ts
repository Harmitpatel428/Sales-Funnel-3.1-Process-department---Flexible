import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * POST /api/integrations/[slug]/install
 * Install integration
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { slug } = await params;
        const body = await req.json();
        const { config, credentials } = body;

        // Find the integration
        const integration = await prisma.integration.findUnique({
            where: { slug },
        });

        if (!integration || !integration.isActive) {
            return notFoundResponse('Integration');
        }

        // Check if already installed
        const existing = await prisma.integrationInstallation.findFirst({
            where: { integrationId: integration.id, tenantId: session.tenantId },
        });

        if (existing) {
            return NextResponse.json(
                { success: false, message: 'Integration already installed' },
                { status: 400 }
            );
        }

        // Validate config against schema
        const configSchema = JSON.parse(integration.configSchema);
        const requiredFields = configSchema.required || [];

        for (const field of requiredFields) {
            if (!config?.[field]) {
                return NextResponse.json(
                    { success: false, message: `Required field missing: ${field}` },
                    { status: 400 }
                );
            }
        }

        // Create installation
        const installation = await prisma.integrationInstallation.create({
            data: {
                integrationId: integration.id,
                tenantId: session.tenantId,
                userId: session.userId,
                config: JSON.stringify(config || {}),
                credentials: credentials ? JSON.stringify(credentials) : null,
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                id: installation.id,
                integrationId: installation.integrationId,
                isActive: installation.isActive,
                installedAt: installation.installedAt,
            },
            message: `${integration.name} installed successfully`,
        }, { status: 201 });
    }
);

/**
 * DELETE /api/integrations/[slug]/install
 * Uninstall integration
 */
export const DELETE = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { slug } = await params;

        // Find the integration
        const integration = await prisma.integration.findUnique({
            where: { slug },
        });

        if (!integration) {
            return notFoundResponse('Integration');
        }

        // Find installation
        const installation = await prisma.integrationInstallation.findFirst({
            where: { integrationId: integration.id, tenantId: session.tenantId },
        });

        if (!installation) {
            return NextResponse.json(
                { success: false, message: 'Integration not installed' },
                { status: 404 }
            );
        }

        // Delete installation
        await prisma.integrationInstallation.delete({
            where: { id: installation.id },
        });

        return NextResponse.json({
            success: true,
            message: `${integration.name} uninstalled successfully`,
        });
    }
);
