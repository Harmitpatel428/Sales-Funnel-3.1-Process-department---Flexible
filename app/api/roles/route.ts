import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requirePermissions } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permError = await requirePermissions([PERMISSIONS.USERS_MANAGE_ROLES])(req);
    if (permError) return permError;

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

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permError = await requirePermissions([PERMISSIONS.USERS_MANAGE_ROLES])(req);
    if (permError) return permError;

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
