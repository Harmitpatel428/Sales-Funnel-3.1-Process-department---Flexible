import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PermissionKey, PERMISSIONS, SENSITIVE_FIELDS } from '@/app/types/permissions';
import { emitPermissionsChanged } from '@/lib/websocket/server';
import crypto from 'crypto';

// Cache for user permissions (in-memory)
// In a production serverless environment, this local cache might be per-lambda instance.
// For better consistency, consider using Redis or just relying on fast DB queries.
const permissionCache = new Map<string, Set<string>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getUserPermissions(userId: string): Promise<Set<string>> {
    // Check cache
    const cached = permissionCache.get(userId);
    if (cached) return cached;

    // Fetch from database
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            customRole: {
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            }
        }
    });

    const permissions = new Set<string>();

    // Add permissions from custom role
    if (user?.customRole) {
        user.customRole.permissions.forEach(rp => {
            permissions.add(rp.permission.name);
        });
    }

    // Fallback to legacy role-based permissions
    if (!user?.customRole && user?.role) {
        const legacyPermissions = getLegacyRolePermissions(user.role);
        legacyPermissions.forEach(p => permissions.add(p));
    }

    // Cache permissions
    permissionCache.set(userId, permissions);
    setTimeout(() => permissionCache.delete(userId), CACHE_TTL);

    return permissions;
}

// Map legacy roles to permissions for backward compatibility
function getLegacyRolePermissions(role: string): string[] {
    const rolePermissionMap: Record<string, string[]> = {
        SUPER_ADMIN: Object.values(PERMISSIONS),
        ADMIN: Object.values(PERMISSIONS).filter(p => !p.includes('manage_tenants')),
        SALES_MANAGER: [
            PERMISSIONS.LEADS_CREATE, PERMISSIONS.LEADS_VIEW_ALL, PERMISSIONS.LEADS_EDIT_ALL,
            PERMISSIONS.LEADS_ASSIGN, PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_FORWARD,
            PERMISSIONS.LEADS_EXPORT, PERMISSIONS.CASES_VIEW_ALL, PERMISSIONS.REPORTS_VIEW_SALES
        ],
        SALES_EXECUTIVE: [
            PERMISSIONS.LEADS_CREATE, PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED,
            PERMISSIONS.LEADS_EDIT_OWN, PERMISSIONS.LEADS_EDIT_ASSIGNED, PERMISSIONS.LEADS_FORWARD,
            PERMISSIONS.CASES_VIEW_ASSIGNED
        ],
        PROCESS_MANAGER: [
            PERMISSIONS.CASES_VIEW_ALL, PERMISSIONS.CASES_EDIT_ALL, PERMISSIONS.CASES_ASSIGN,
            PERMISSIONS.CASES_CHANGE_STATUS, PERMISSIONS.CASES_APPROVE, PERMISSIONS.CASES_EXPORT,
            PERMISSIONS.REPORTS_VIEW_PROCESS
        ],
        PROCESS_EXECUTIVE: [
            PERMISSIONS.CASES_VIEW_ASSIGNED, PERMISSIONS.CASES_EDIT_ASSIGNED, PERMISSIONS.CASES_CHANGE_STATUS
        ]
    };

    return rolePermissionMap[role] || [];
}

export async function checkPermission(
    userId: string,
    permission: PermissionKey
): Promise<boolean> {
    const permissions = await getUserPermissions(userId);
    return permissions.has(permission);
}

export async function checkPermissions(
    userId: string,
    requiredPermissions: PermissionKey[],
    requireAll: boolean = true
): Promise<boolean> {
    const permissions = await getUserPermissions(userId);

    if (requireAll) {
        return requiredPermissions.every(p => permissions.has(p));
    } else {
        return requiredPermissions.some(p => permissions.has(p));
    }
}

// Middleware wrapper for API routes
export function requirePermissions(
    permissions: PermissionKey[],
    requireAll: boolean = true
) {
    return async (req: NextRequest): Promise<NextResponse | null> => {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }

        const hasPermission = await checkPermissions(
            session.userId,
            permissions,
            requireAll
        );

        if (!hasPermission) {
            // Log permission denial
            await prisma.auditLog.create({
                data: {
                    actionType: 'PERMISSION_DENIED',
                    entityType: 'permission',
                    description: `Permission denied: ${permissions.join(', ')}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    metadata: JSON.stringify({
                        requiredPermissions: permissions,
                        endpoint: req.nextUrl.pathname
                    })
                }
            });

            return NextResponse.json(
                { success: false, message: 'Insufficient permissions' },
                { status: 403 }
            );
        }

        return null; // Permission granted
    };
}

// Record-level permission filter
export async function getRecordLevelFilter(
    userId: string,
    resource: 'leads' | 'cases',
    action: 'view' | 'edit' | 'delete'
): Promise<any> {
    const permissions = await getUserPermissions(userId);

    const allPermission = `${resource}.${action}.all` as PermissionKey; // Assumes permissions follow this structure
    const assignedPermission = `${resource}.${action}.assigned` as PermissionKey;
    const ownPermission = `${resource}.${action}.own` as PermissionKey;

    // Note: This relies on the convention that permission strings match the resource.action.scope pattern
    // defined in PERMISSIONS constant.

    if (permissions.has(allPermission) || permissions.has('leads.view.all') && resource === 'leads' && action === 'view') {
        return {}; // No filter, can access all
    }

    // Double check manual mapping if casting is risky
    if (resource === 'leads') {
        if (action === 'view') {
            if (permissions.has(PERMISSIONS.LEADS_VIEW_ALL)) return {};
            if (permissions.has(PERMISSIONS.LEADS_VIEW_ASSIGNED)) return { assignedToId: userId };
            if (permissions.has(PERMISSIONS.LEADS_VIEW_OWN)) return { createdById: userId };
        }
        if (action === 'edit') {
            if (permissions.has(PERMISSIONS.LEADS_EDIT_ALL)) return {};
            if (permissions.has(PERMISSIONS.LEADS_EDIT_ASSIGNED)) return { assignedToId: userId };
            if (permissions.has(PERMISSIONS.LEADS_EDIT_OWN)) return { createdById: userId };
        }
    }

    if (resource === 'cases') {
        if (action === 'view') {
            if (permissions.has(PERMISSIONS.CASES_VIEW_ALL)) return {};
            if (permissions.has(PERMISSIONS.CASES_VIEW_ASSIGNED)) return { assignedProcessUserId: userId }; // Cases use assignedProcessUserId? Or assignedToId?
            // Checking schema: cases has assignedProcessUserId. Lead has assignedToId.
            // Wait, schema has cases.assignedProcessUserId.
            // I will use assignedProcessUserId for cases.
            if (permissions.has(PERMISSIONS.CASES_VIEW_OWN)) return { tenantId: 'impossible' }; // Cases don't have createdById in schema!
        }
        // Added fallback for cases structure which might differ
    }

    // Generic fallback if above specific checks didn't catch it (for future resources)
    if (permissions.has(assignedPermission)) {
        return { assignedToId: userId };
    }

    if (permissions.has(ownPermission)) {
        return { createdById: userId };
    }

    return { id: 'impossible-id' }; // No access
}

// Field-level permission filter
export async function getFieldPermissions(
    userId: string,
    resource: string
): Promise<{ canView: string[]; canEdit: string[] }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            customRole: {
                include: {
                    fieldPermissions: {
                        where: { resource }
                    }
                }
            }
        }
    });

    const canView: string[] = [];
    const canEdit: string[] = [];

    if (user?.customRole) {
        user.customRole.fieldPermissions.forEach(fp => {
            if (fp.canView) canView.push(fp.fieldName);
            if (fp.canEdit) canEdit.push(fp.fieldName);
        });
    } else {
        // Legacy roles: use wildcard '*' to allow all fields by default for backward compatibility.
        // The FieldPermissionGuard component checks for '*' to allow any field.
        canView.push('*');
        canEdit.push('*');
    }

    return { canView, canEdit };
}

// Clear permission cache for user
export function clearPermissionCache(userId: string) {
    permissionCache.delete(userId);
}

export async function computePermissionsHash(userId: string): Promise<string> {
    const permissions = await getUserPermissions(userId);
    const sorted = Array.from(permissions).sort();
    return crypto.createHash('md5').update(sorted.join(',')).digest('hex');
}

export async function invalidatePermissionCacheForUser(userId: string, tenantId: string): Promise<void> {
    clearPermissionCache(userId);
    // Emit WebSocket event to all user's connected clients
    // We compute hash ensuring we get fresh permissions (cache was just cleared)
    const newHash = await computePermissionsHash(userId);
    await emitPermissionsChanged(tenantId, userId, newHash);
}
