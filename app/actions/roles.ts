'use server';

import { prisma } from '@/lib/db';
import { requireRole } from './auth';

/**
 * Get all available roles (System + Custom)
 */
export async function getAvailableRolesAction() {
    try {
        await requireRole(['ADMIN']);

        // 1. Get system roles (we can hardcode or fetch if we seeded them)
        // For now, we return valid system role codes.
        const systemRoles = [
            { id: 'SALES_EXECUTIVE', name: 'Sales Executive', isSystem: true },
            { id: 'SALES_MANAGER', name: 'Sales Manager', isSystem: true },
            { id: 'PROCESS_EXECUTIVE', name: 'Process Executive', isSystem: true },
            { id: 'PROCESS_MANAGER', name: 'Process Manager', isSystem: true },
            { id: 'ADMIN', name: 'Admin', isSystem: true },
        ];

        // 2. Fetch custom roles from DB
        const customRoles = await prisma.role.findMany({
            where: { isActive: true },
            select: { id: true, name: true, isSystem: true },
            orderBy: { name: 'asc' }
        });

        return {
            success: true,
            roles: [
                ...systemRoles,
                ...customRoles.filter(r => !r.isSystem) // specific custom roles (if we seeded system roles in DB, filter them to avoid dupes)
            ]
        };
    } catch (error) {
        console.error('Failed to fetch roles:', error);
        return { success: false, message: 'Failed to fetch roles', roles: [] };
    }
}
