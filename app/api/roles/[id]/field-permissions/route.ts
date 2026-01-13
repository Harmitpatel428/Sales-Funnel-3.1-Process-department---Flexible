
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requirePermissions } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permError = await requirePermissions([PERMISSIONS.USERS_MANAGE_ROLES])(req);
    if (permError) return permError;

    const roleId = params.id;
    const { resource, fieldName, canView, canEdit } = await req.json();

    if (!resource || !fieldName) {
        return NextResponse.json({ error: 'Missing resource or fieldName' }, { status: 400 });
    }

    try {
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
                tenantId: session.tenantId || 'system', // specific handling for system context if needed
                afterValue: JSON.stringify({ resource, fieldName, canView, canEdit })
            }
        });

        return NextResponse.json({ success: true, data: fieldPermission });
    } catch (error) {
        console.error('Failed to update field permission', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
