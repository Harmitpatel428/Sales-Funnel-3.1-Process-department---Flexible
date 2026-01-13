/**
 * Document Retention Policy
 * Defines logic for document lifecycle management
 */

import { addYears, addMonths, addDays, isBefore } from 'date-fns';
import { prisma } from '@/lib/db';

export enum RetentionType {
    PERMANENT = 'PERMANENT',
    YEARS_7 = 'YEARS_7', // Legacy enum support
    YEARS_3 = 'YEARS_3',
    MONTHS_6 = 'MONTHS_6',
    CUSTOM = 'CUSTOM'
}

// Fallback defaults
export const DEFAULT_RETENTION_POLICIES: Record<string, { period: number, unit: string }> = {
    'Tax Bill': { period: 7, unit: 'YEARS' },
    'Electricity Bill': { period: 3, unit: 'YEARS' },
    'Rough Work': { period: 6, unit: 'MONTHS' },
    'DEFAULT': { period: 7, unit: 'YEARS' }
};

export async function calculateRetentionDate(
    tenantId: string,
    documentType: string,
    createdAt: Date = new Date()
): Promise<Date | null> {

    // 1. Try to fetch custom policy from DB
    try {
        const policy = await (prisma as any).retentionPolicy.findUnique({
            where: {
                tenantId_documentType: {
                    tenantId,
                    documentType
                }
            }
        });

        if (policy) {
            if (policy.retentionUnit === 'PERMANENT') return null;

            const amount = policy.retentionPeriod;
            switch (policy.retentionUnit) {
                case 'YEARS': return addYears(createdAt, amount);
                case 'MONTHS': return addMonths(createdAt, amount);
                case 'DAYS': return addDays(createdAt, amount);
                default: return addYears(createdAt, 7);
            }
        }
    } catch (e) {
        console.warn('Failed to fetch retention policy, using detail:', e);
    }

    // 2. Fallback to hardcoded defaults
    const defaultPolicy = DEFAULT_RETENTION_POLICIES[documentType] || DEFAULT_RETENTION_POLICIES['DEFAULT'];

    switch (defaultPolicy.unit) {
        case 'YEARS': return addYears(createdAt, defaultPolicy.period);
        case 'MONTHS': return addMonths(createdAt, defaultPolicy.period);
        case 'DAYS': return addDays(createdAt, defaultPolicy.period);
        default: return addYears(createdAt, 7);
    }
}

export function isExpired(expiryDate: Date | null): boolean {
    if (!expiryDate) return false;
    return isBefore(expiryDate, new Date());
}
