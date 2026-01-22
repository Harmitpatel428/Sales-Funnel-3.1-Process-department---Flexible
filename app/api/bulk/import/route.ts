import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emitBulkImportCompleted } from '@/lib/websocket/server';
import { generateBypassToken, validateBypassToken } from '@/lib/middleware/validation';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/bulk/import
 * Generate bypass token (Admin only)
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
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
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
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
        } catch (parseError) {
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

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const rowErrors: string[] = [];

            // Validate based on entity type
            if (entityType === 'leads') {
                if (!isBypassed) {
                    // Strict Validation (only if not bypassed)
                    // Required field validation
                    if (!record.clientName && !record.company && !record.email) {
                        rowErrors.push('At least one of clientName, company, or email is required');
                    }

                    // Email format validation
                    if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
                        rowErrors.push('Invalid email format');
                    }
                }

                // Check for duplicates
                if (skipDuplicates && record.email) {
                    try {
                        const existing = await prisma.lead.findFirst({
                            where: { email: record.email, tenantId: tenantId, isDeleted: false },
                        });
                        if (existing) {
                            results.skipped++;
                            continue;
                        }
                    } catch (dupCheckErr) {
                        console.error('[Bulk Import] Duplicate check failed:', dupCheckErr);
                    }
                }
            }

            if (rowErrors.length > 0) {
                results.failed++;
                results.errors.push({ row: i + 1, data: record, errors: rowErrors });
                continue;
            }

            if (validateOnly) {
                results.successful++;
                continue;
            }

            // Create record
            try {
                if (entityType === 'leads') {
                    const lead = await prisma.lead.create({
                        data: {
                            clientName: record.clientName,
                            mobileNumber: record.mobileNumber,
                            email: record.email,
                            company: record.company,
                            source: record.source,
                            status: record.status || 'NEW',
                            notes: record.notes,
                            kva: record.kva,
                            consumerNumber: record.consumerNumber,
                            discom: record.discom,
                            gidc: record.gidc,
                            gstNumber: record.gstNumber,
                            companyLocation: record.companyLocation,
                            unitType: record.unitType,
                            marketingObjective: record.marketingObjective,
                            budget: record.budget,
                            termLoan: record.termLoan,
                            timeline: record.timeline,
                            contactOwner: record.contactOwner,
                            customFields: record.customFields ? JSON.stringify(record.customFields) : '{}',
                            tenantId: tenantId,
                            createdById: userId,
                            assignedToId: userId,
                            isDone: false,
                            isDeleted: false,
                        },
                    });
                    results.created.push(lead.id);
                }
                results.successful++;
            } catch (createError: any) {
                console.error('[Bulk Import] Failed to create lead:', createError);
                results.failed++;
                results.errors.push({
                    row: i + 1,
                    data: record,
                    // Generic error message to prevent leaking internal details
                    errors: ['Failed to create record'],
                });
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
