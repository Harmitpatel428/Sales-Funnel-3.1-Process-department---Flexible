/**
 * Background Job: Document Cleanup
 * Checks for expired documents and soft-deletes or archives them.
 * Note: This file contains the logic, which should be invoked by a cron job or queue worker.
 */

import { prisma } from '@/lib/db';
import { isExpired } from '../retention-policy';

export async function processDocumentRetention() {
    console.log('Starting document retention check...');

    // 1. Find expired documents
    const documents = await prisma.document.findMany({
        where: {
            isDeleted: false,
            expiresAt: {
                lte: new Date(), // Expires at or before now
            },
        },
        take: 1000, // Batch limit
    });

    let expiredCount = 0;

    for (const doc of documents) {
        // Load applicable retention policy
        const policy = await prisma.retentionPolicy.findUnique({
            where: {
                tenantId_documentType: {
                    tenantId: doc.tenantId,
                    documentType: doc.documentType
                }
            }
        });

        // Delete only if autoDelete is true
        if (policy?.autoDelete) {
            // Mark as deleted or archived
            await prisma.document.update({
                where: { id: doc.id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                }
            });
            console.log(`Document ${doc.id} expired on ${doc.expiresAt?.toISOString()} and was deleted.`);
            expiredCount++;
        } else {
            console.log(`Document ${doc.id} expired but autoDelete is disabled (Policy: ${policy ? 'Found' : 'Not Found'}). Skipping.`);
        }
    }

    console.log(`Retention check complete. Processed ${documents.length}, Expired/Deleted: ${expiredCount}`);
    return expiredCount;
}

// Ensure this can be run as a script if needed
if (require.main === module) {
    processDocumentRetention()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
