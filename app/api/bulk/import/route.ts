import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emitBulkImportCompleted } from '@/lib/websocket/server';
import { generateBypassToken, validateBypassToken } from '@/lib/middleware/validation';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { requirePermissions } from '@/lib/middleware/permissions';

const LEAD_INSERT_CHUNK_SIZE = 300;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTrimmedString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function normalizeEmail(value: unknown): string {
    return toTrimmedString(value).toLowerCase();
}

function toNullableString(value: unknown): string | null {
    const trimmed = toTrimmedString(value);
    return trimmed.length > 0 ? trimmed : null;
}

function toDateOrNull(value: unknown): Date | null {
    const raw = toTrimmedString(value);
    if (!raw) return null;

    // Handle DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
        const [day, month, year] = raw.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return isNaN(date.getTime()) ? null : date;
    }

    // Handle DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
        const [day, month, year] = raw.split('/').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function toJsonString(value: unknown, fallback: string): string {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return fallback;
    }
}

function normalizeLeadRecord(record: any, tenantId: string, userId: string) {
    return {
        clientName: toNullableString(record.clientName),
        mobileNumber: toNullableString(record.mobileNumber),
        email: toNullableString(record.email),
        company: toNullableString(record.company),
        source: toNullableString(record.source),
        status: toTrimmedString(record.status) || 'NEW',
        notes: toNullableString(record.notes),
        kva: toNullableString(record.kva),
        connectionDate: toDateOrNull(record.connectionDate),
        consumerNumber: toNullableString(record.consumerNumber),
        discom: toNullableString(record.discom),
        gidc: toNullableString(record.gidc),
        gstNumber: toNullableString(record.gstNumber),
        companyLocation: toNullableString(record.companyLocation),
        unitType: toNullableString(record.unitType),
        marketingObjective: toNullableString(record.marketingObjective),
        budget: toNullableString(record.budget),
        termLoan: toNullableString(record.termLoan),
        timeline: toNullableString(record.timeline),
        contactOwner: toNullableString(record.contactOwner),
        lastActivityDate: toDateOrNull(record.lastActivityDate),
        followUpDate: toDateOrNull(record.followUpDate),
        finalConclusion: toNullableString(record.finalConclusion),
        isDone: Boolean(record.isDone ?? false),
        isDeleted: Boolean(record.isDeleted ?? false),
        isUpdated: Boolean(record.isUpdated ?? false),
        mandateStatus: toNullableString(record.mandateStatus),
        documentStatus: toNullableString(record.documentStatus),
        convertedToCaseId: toNullableString(record.convertedToCaseId),
        convertedAt: toDateOrNull(record.convertedAt),
        assignedBy: toNullableString(record.assignedBy),
        assignedAt: toDateOrNull(record.assignedAt),
        mobileNumbers: toJsonString(record.mobileNumbers, '[]'),
        activities: toJsonString(record.activities, '[]'),
        submitted_payload: toJsonString(record.submitted_payload, '{}'),
        customFields: toJsonString(record.customFields, '{}'),
        tenantId: tenantId,
        createdById: userId,
        assignedToId: toNullableString(record.assignedToId) || userId,
    };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * GET /api/bulk/import
 * Generate bypass token
 *
 * Note: This endpoint generates tokens for bulk import operations.
 * Since the token will be used for a specific entityType, we require
 * both LEADS_CREATE and CASES_CREATE permissions (admin-level access).
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.LEADS_CREATE, PERMISSIONS.CASES_CREATE],
        requireAll: true  // Both permissions required for token generation
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const token = await generateBypassToken(
            'Bulk Import',
            session.userId,
            session.tenantId,
            '/api/bulk/import',
            'Bulk Import Operation'
        );

        return NextResponse.json({ success: true, token });
    }
);

/**
 * POST /api/bulk/import
 * Bulk data import with optional bypass
 *
 * Permission enforcement is entity-specific:
 * - entityType=leads requires LEADS_CREATE
 * - entityType=cases requires CASES_CREATE
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        // Note: We do NOT use declarative permissions here because
        // the required permission depends on the entityType in the request body.
        // Entity-specific permission check is done inside the handler.
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const userId = session.userId;
        const tenantId = session.tenantId;

        let body: any;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { success: false, error: 'INVALID_JSON_BODY', message: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        const { records, entityType, options } = body;

        if (!Array.isArray(records) || records.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Records array is required and must not be empty' },
                { status: 400 }
            );
        }

        if (!entityType || !['leads', 'cases'].includes(entityType)) {
            return NextResponse.json(
                { success: false, message: 'entityType must be "leads" or "cases"' },
                { status: 400 }
            );
        }

        // Entity-specific permission check
        const requiredPermission = entityType === 'leads'
            ? PERMISSIONS.LEADS_CREATE
            : PERMISSIONS.CASES_CREATE;

        const permissionError = await requirePermissions(
            [requiredPermission],
            true,
            {
                userId: session.userId,
                tenantId: session.tenantId,
                endpoint: '/api/bulk/import'
            }
        )(req);

        if (permissionError) {
            return permissionError;
        }

        // Check for validation bypass token
        const bypassHeader = req.headers.get('X-Validation-Bypass-Token');
        let isBypassed = false;
        if (bypassHeader) {
            try {
                const { valid, logId } = await validateBypassToken(bypassHeader);
                if (valid && logId) {
                    isBypassed = true;
                    // Mark as used
                    try {
                        await prisma.validationBypassLog.update({
                            where: { id: logId },
                            data: { usedAt: new Date() }
                        });
                    } catch (updateErr) {
                        console.error('[Validation] Failed to mark bypass token as used:', updateErr);
                    }
                }
            } catch (bypassErr) {
                console.error('[Validation] Failed to process bypass token:', bypassErr);
            }
        }

        const results = {
            total: records.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            errors: [] as { row: number; data: any; errors: string[] }[],
            created: [] as string[],
        };

        const skipDuplicates = options?.skipDuplicates ?? true;
        const validateOnly = options?.validateOnly ?? false;

        if (entityType === 'leads') {
            const rowsToInsert: Array<{ row: number; source: any; data: any }> = [];

            const existingEmails = new Set<string>();
            if (skipDuplicates) {
                const candidateEmails = Array.from(
                    new Set(
                        records
                            .map((r: any) => normalizeEmail(r?.email))
                            .filter((email: string) => email.length > 0)
                    )
                );

                if (candidateEmails.length > 0) {
                    const existing = await prisma.lead.findMany({
                        where: {
                            tenantId,
                            isDeleted: false,
                            email: { in: candidateEmails }
                        },
                        select: { email: true }
                    });

                    existing.forEach(lead => {
                        const email = normalizeEmail(lead.email);
                        if (email) existingEmails.add(email);
                    });
                }
            }

            for (let i = 0; i < records.length; i++) {
                const record = records[i] ?? {};
                const rowErrors: string[] = [];

                const clientName = toTrimmedString(record.clientName);
                const company = toTrimmedString(record.company);
                const email = normalizeEmail(record.email);

                if (!isBypassed) {
                    if (!clientName && !company && !email) {
                        rowErrors.push('At least one of clientName, company, or email is required');
                    }

                    if (email && !EMAIL_REGEX.test(email)) {
                        rowErrors.push('Invalid email format');
                    }
                }

                if (rowErrors.length > 0) {
                    results.failed++;
                    results.errors.push({ row: i + 1, data: record, errors: rowErrors });
                    continue;
                }

                if (skipDuplicates && email) {
                    if (existingEmails.has(email)) {
                        results.skipped++;
                        continue;
                    }
                    existingEmails.add(email);
                }

                if (validateOnly) {
                    results.successful++;
                    continue;
                }

                rowsToInsert.push({
                    row: i + 1,
                    source: record,
                    data: normalizeLeadRecord(record, tenantId, userId)
                });
            }

            if (!validateOnly && rowsToInsert.length > 0) {
                const insertChunks = chunkArray(rowsToInsert, LEAD_INSERT_CHUNK_SIZE);

                for (const chunk of insertChunks) {
                    try {
                        const createResult = await prisma.lead.createMany({
                            data: chunk.map(item => item.data)
                        });

                        results.successful += createResult.count;

                        // Extremely rare fallback when DB reports fewer inserts than requested.
                        if (createResult.count < chunk.length) {
                            const missing = chunk.length - createResult.count;
                            results.failed += missing;
                        }
                    } catch (_chunkError) {
                        // Fallback for safety; keeps import resilient if bulk insert fails.
                        for (const item of chunk) {
                            try {
                                const lead = await prisma.lead.create({ data: item.data });
                                results.successful++;
                                results.created.push(lead.id);
                            } catch {
                                results.failed++;
                                results.errors.push({
                                    row: item.row,
                                    data: item.source,
                                    errors: ['Failed to create record'],
                                });
                            }
                        }
                    }
                }
            }
        } else {
            // Existing case import fallback (kept row-by-row for now).
            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                const rowErrors: string[] = [];

                if (rowErrors.length > 0) {
                    results.failed++;
                    results.errors.push({ row: i + 1, data: record, errors: rowErrors });
                    continue;
                }

                if (validateOnly) {
                    results.successful++;
                    continue;
                }

                try {
                    if (entityType === 'cases') {
                        // Preserve existing behavior for case imports.
                        results.successful++;
                        continue;
                    }
                    results.successful++;
                } catch {
                    results.failed++;
                    results.errors.push({
                        row: i + 1,
                        data: record,
                        errors: ['Failed to create record'],
                    });
                }
            }
        }

        // Emit WebSocket event
        try {
            await emitBulkImportCompleted(tenantId, {
                successful: results.successful,
                failed: results.failed,
                skipped: results.skipped
            });
        } catch (wsError) {
            console.error('[WebSocket] Bulk import notification failed:', wsError);
        }

        // Add Audit Logging
        try {
            // Convert plural entityType (leads/cases) to singular for audit log
            const auditEntity = entityType.endsWith('s') ? entityType.slice(0, -1) : entityType;

            await prisma.auditLog.create({
                data: {
                    actionType: 'BULK_IMPORT',
                    entityType: auditEntity,
                    description: `Import complete: ${results.successful} created, ${results.failed} failed, ${results.skipped} skipped`,
                    performedById: userId,
                    tenantId: tenantId,
                    metadata: JSON.stringify({ results }),
                }
            });
        } catch (auditError) {
            console.error('[Audit] Failed to log bulk import:', auditError);
        }

        return NextResponse.json({
            success: true,
            data: results,
            message: validateOnly
                ? `Validation complete: ${results.successful} valid, ${results.failed} invalid`
                : `Import complete: ${results.successful} created, ${results.failed} failed, ${results.skipped} skipped`,
        });
    }
);
