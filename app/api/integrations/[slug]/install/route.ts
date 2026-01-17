import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { prisma } from '@/lib/db';

// POST /api/integrations/[slug]/install - Install integration
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { slug } = await params;
        const body = await req.json();
        const { config, credentials } = body;

        // Find the integration
        const integration = await prisma.integration.findUnique({
            where: { slug },
        });

        if (!integration || !integration.isActive) {
            return NextResponse.json(
                { success: false, message: 'Integration not found' },
                { status: 404 }
            );
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
    } catch (error: any) {
        console.error('Error installing integration:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to install integration' },
            { status: 500 }
        );
    }
}

// DELETE /api/integrations/[slug]/install - Uninstall integration
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { slug } = await params;

        // Find the integration
        const integration = await prisma.integration.findUnique({
            where: { slug },
        });

        if (!integration) {
            return NextResponse.json(
                { success: false, message: 'Integration not found' },
                { status: 404 }
            );
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
    } catch (error: any) {
        console.error('Error uninstalling integration:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to uninstall integration' },
            { status: 500 }
        );
    }
}
