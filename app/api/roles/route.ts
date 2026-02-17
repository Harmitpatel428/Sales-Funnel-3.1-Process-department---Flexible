import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@/app/types/permissions';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/roles
 * List all roles (requires USERS_MANAGE_ROLES permission)
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.USERS_MANAGE_ROLES]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const roles = await prisma.role.findMany({
            where: {
                OR: [
                    { tenantId: session.tenantId },
                    { isSystem: true }
                ]
            },
            include: {
                permissions: {
                    include: {
                        permission: true
                    }
                },
                _count: {
                    select: { users: true }
                }
            }
        });

        return NextResponse.json({ success: true, data: roles });
    }
);

/**
 * POST /api/roles
 * Create a new role (requires USERS_MANAGE_ROLES permission)
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.USERS_MANAGE_ROLES]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { name, description, permissions, fieldPermissions } = await req.json();

        // Create role
        const role = await prisma.role.create({
            data: {
                name,
                description,
                tenantId: session.tenantId,
                isSystem: false
            }
        });

        // Add permissions
        if (permissions && Array.isArray(permissions)) {
            for (const permName of permissions) {
                const permission = await prisma.permission.findUnique({
                    where: { name: permName }
                });

                if (permission) {
                    await prisma.rolePermission.create({
                        data: {
                            roleId: role.id,
                            permissionId: permission.id
                        }
                    });
                }
            }
        }

        // Add field permissions
        if (fieldPermissions && Array.isArray(fieldPermissions)) {
            for (const fp of fieldPermissions) {
                await prisma.fieldPermission.create({
                    data: {
                        roleId: role.id,
                        resource: fp.resource,
                        fieldName: fp.fieldName,
                        canView: fp.canView,
                        canEdit: fp.canEdit
                    }
                });
            }
        }

        // Audit log
        await prisma.auditLog.create({
            data: {
                actionType: 'ROLE_CREATED',
                entityType: 'role',
                entityId: role.id,
                description: `Custom role created: ${name}`,
                performedById: session.userId,
                tenantId: session.tenantId,
                afterValue: JSON.stringify({ name, permissions })
            }
        });

        return NextResponse.json({ success: true, data: role });
    }
);
