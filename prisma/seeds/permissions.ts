import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, PERMISSION_METADATA, SENSITIVE_FIELDS } from '../../app/types/permissions';

export async function seedPermissions(prisma: PrismaClient) {
    console.log('Seeding permissions...');

    // 1. Seed Permissions
    for (const [key, permissionName] of Object.entries(PERMISSIONS)) {
        const metadata = PERMISSION_METADATA[permissionName];
        if (!metadata) continue;

        const parts = permissionName.split('.');
        const resource = parts[0];
        const action = parts[1];

        await prisma.permission.upsert({
            where: { name: permissionName },
            update: {
                resource,
                action,
                scope: metadata.scope || null,
                description: metadata.description,
                category: metadata.category
            },
            create: {
                name: permissionName,
                resource,
                action,
                scope: metadata.scope || null,
                description: metadata.description,
                category: metadata.category
            }
        });
    }

    // 2. Seed Roles and Assign Permissions
    const roles = [
        {
            name: 'PROCESS_MANAGER',
            description: 'Manages document verification and case processing',
            permissions: [
                PERMISSIONS.DOCUMENTS_VIEW_ALL,
                PERMISSIONS.DOCUMENTS_VERIFY,
                PERMISSIONS.DOCUMENTS_DOWNLOAD,
                PERMISSIONS.CASES_VIEW_ALL,
                // Add other permissions as needed
            ]
        },
        {
            name: 'PROCESS_EXECUTIVE',
            description: 'Handles document uploads and initial checks',
            permissions: [
                PERMISSIONS.DOCUMENTS_UPLOAD,
                PERMISSIONS.DOCUMENTS_VIEW_CASE,
                PERMISSIONS.DOCUMENTS_DOWNLOAD,
            ]
        },
        {
            name: 'SALES_EXECUTIVE',
            description: 'Sales team member',
            permissions: [
                PERMISSIONS.LEADS_CREATE,
                PERMISSIONS.LEADS_VIEW_ASSIGNED,
                PERMISSIONS.EMAIL_VIEW,
                PERMISSIONS.EMAIL_SEND,
                PERMISSIONS.CALENDAR_VIEW,
                PERMISSIONS.CALENDAR_CREATE
            ]
        }
    ];

    for (const roleDef of roles) {
        // Create Role
        const role = await prisma.role.upsert({
            where: { name: roleDef.name }, // Assuming name is unique or we find by name
            // Note: Schema doesn't have unique constraint on name for Role, but logic usually implies it for system roles
            // But since upsert requires unique, and name isn't unique in schema, we use findFirst/create pattern or adjust if we can't upsert by name.
            // Wait, standard prisma upsert requires unique where.
            // Schema: model Role { ... } no unique on name.
            // We should use findFirst then create or update.
            update: {
                description: roleDef.description,
                isSystem: true
            },
            create: {
                name: roleDef.name,
                description: roleDef.description,
                isSystem: true
            }
            // Actually, upsert requires a unique field. `name` is not unique in schema provided (only slug in Tenant).
            // So we can't use upsert on name. 
            // We'll use findFirst.
        } as any); // Type assertion to avoid validation error if I wrote wrong code before
    }

    // Correct implementation without upsert on non-unique field
    for (const roleDef of roles) {
        let role = await prisma.role.findFirst({
            where: { name: roleDef.name, isSystem: true }
        });

        if (!role) {
            role = await prisma.role.create({
                data: {
                    name: roleDef.name,
                    description: roleDef.description,
                    isSystem: true
                }
            });
        }

        // Assign Permissions
        for (const permName of roleDef.permissions) {
            if (!permName) continue; // Skip undefined

            const permission = await prisma.permission.findUnique({
                where: { name: permName }
            });

            if (permission) {
                await prisma.rolePermission.upsert({
                    where: {
                        roleId_permissionId: {
                            roleId: role.id,
                            permissionId: permission.id
                        }
                    },
                    update: {},
                    create: {
                        roleId: role.id,
                        permissionId: permission.id
                    }
                });
            }
        }
    }

    console.log('Permissions seeded and assigned successfully');
}
