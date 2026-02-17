import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { invalidatePermissionCacheForUser } from '@/lib/middleware/permissions';
import { withApiHandler, ApiContext, unauthorizedResponse } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * PATCH /api/roles/[id]/field-permissions
 * Update field permissions for a role
 */
export const PATCH = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.USERS_MANAGE_ROLES]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id: roleId } = await params;
        const { resource, fieldName, canView, canEdit } = await req.json();

        if (!resource || !fieldName) {
            return NextResponse.json({ success: false, error: 'Missing resource or fieldName' }, { status: 400 });
        }

        const fieldPermission = await prisma.fieldPermission.upsert({
            where: {
                roleId_resource_fieldName: {
                    roleId,
                    resource,
                    fieldName
                }
            },
            update: {
                canView,
                canEdit
            },
            create: {
                roleId,
                resource,
                fieldName,
                canView,
                canEdit
            }
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                actionType: 'ROLE_UPDATED',
                entityType: 'role',
                entityId: roleId,
                description: `Updated field permission for ${resource}.${fieldName}`,
                performedById: session.userId,
                tenantId: session.tenantId || 'system',
                afterValue: JSON.stringify({ resource, fieldName, canView, canEdit })
            }
        });

        // Invalidate permissions for all users with this role
        const affectedUsers = await prisma.user.findMany({
            where: { roleId: roleId, isActive: true },
            select: { id: true, tenantId: true }
        });

        // Invalidate in parallel
        await Promise.all(affectedUsers.map(u =>
            invalidatePermissionCacheForUser(u.id, u.tenantId)
        ));

        return NextResponse.json({ success: true, data: fieldPermission });
    }
);
