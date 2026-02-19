import { NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { getRecordLevelFilter } from '@/lib/middleware/permissions';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';
import { successResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { PERMISSIONS } from '@/app/types/permissions';

const BulkDeleteSchema = z.object({
    leadIds: z.array(z.string().min(1)).min(1).max(50000),
    reason: z.string().max(1000).optional()
});

const BULK_CHUNK_SIZE = 850;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        rateLimit: 10,
        permissions: [PERMISSIONS.LEADS_DELETE_OWN, PERMISSIONS.LEADS_DELETE_ALL],
        requireAll: false
    },
    async (req: NextRequest, context: ApiContext) => {
        const session = context.session!;

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return validationErrorResponse(['Invalid JSON body']);
        }

        const parsed = BulkDeleteSchema.safeParse(body);
        if (!parsed.success) {
            return validationErrorResponse(
                parsed.error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`)
            );
        }

        const uniqueLeadIds = Array.from(new Set(parsed.data.leadIds.map(id => id.trim()).filter(Boolean)));
        if (uniqueLeadIds.length === 0) {
            return validationErrorResponse(['No valid lead IDs provided']);
        }

        const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'delete');

        return withTenant(session.tenantId, async () => {
            let deleted = 0;

            const chunks = chunkArray(uniqueLeadIds, BULK_CHUNK_SIZE);

            for (const idsChunk of chunks) {
                // Single query per chunk for speed: permission filter + soft-delete in one pass.
                const updateResult = await prisma.lead.updateMany({
                    where: {
                        id: { in: idsChunk },
                        tenantId: session.tenantId,
                        ...recordFilter,
                        isDeleted: false
                    },
                    data: {
                        isDeleted: true
                    }
                });
                deleted += updateResult.count;
            }

            const skipped = uniqueLeadIds.length - deleted;

            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_DELETED',
                    entityType: 'lead',
                    entityId: `bulk_${Date.now()}`,
                    description: `Bulk soft delete completed: ${deleted}/${uniqueLeadIds.length} leads deleted`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    metadata: JSON.stringify({
                        requested: uniqueLeadIds.length,
                        deleted,
                        skipped,
                        reason: parsed.data.reason || null,
                        sampleLeadIds: uniqueLeadIds.slice(0, 100)
                    })
                }
            });

            return successResponse(
                {
                    requested: uniqueLeadIds.length,
                    deleted,
                    skipped
                },
                `Bulk delete complete: ${deleted} deleted`
            );
        });
    }
);
