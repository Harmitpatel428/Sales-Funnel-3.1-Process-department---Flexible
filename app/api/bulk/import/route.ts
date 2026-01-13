import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/bulk/import - Bulk data import with validation
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
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
                // Required field validation
                if (!record.clientName && !record.company && !record.email) {
                    rowErrors.push('At least one of clientName, company, or email is required');
                }

                // Email format validation
                if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
                    rowErrors.push('Invalid email format');
                }

                // Check for duplicates
                if (skipDuplicates && record.email) {
                    const existing = await prisma.lead.findFirst({
                        where: { email: record.email, tenantId: session.tenantId, isDeleted: false },
                    });
                    if (existing) {
                        results.skipped++;
                        continue;
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
                            tenantId: session.tenantId,
                            createdById: session.userId,
                        },
                    });
                    results.created.push(lead.id);
                }
                results.successful++;
            } catch (error: any) {
                results.failed++;
                results.errors.push({
                    row: i + 1,
                    data: record,
                    errors: [error.message || 'Unknown error creating record'],
                });
            }
        }

        return NextResponse.json({
            success: true,
            data: results,
            message: validateOnly
                ? `Validation complete: ${results.successful} valid, ${results.failed} invalid`
                : `Import complete: ${results.successful} created, ${results.failed} failed, ${results.skipped} skipped`,
        });
    } catch (error: any) {
        console.error('Bulk import error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to process bulk import' },
            { status: 500 }
        );
    }
}
