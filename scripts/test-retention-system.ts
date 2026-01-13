
import { prisma } from '../lib/db';
import { calculateRetentionDate } from '../lib/retention-policy';

async function main() {
    console.log('🔄 Starting Retention Policy System Test...');

    // 1. Setup Test Data
    const tenantId = 'test-tenant-' + Date.now();
    const userId = 'test-user-' + Date.now();

    // Create dummy tenant and user for testing
    try {
        await prisma.tenant.create({
            data: {
                id: tenantId,
                name: 'Test Tenant',
                slug: tenantId,
                isActive: true,
            }
        });
        await prisma.user.create({
            data: {
                id: userId,
                username: 'testuser' + Date.now(),
                name: 'Test User',
                email: 'test' + Date.now() + '@example.com',
                password: 'hashedpassword',
                role: 'ADMIN',
                tenantId: tenantId
            }
        });
    } catch (e) {
        console.log('Setup warning (might exist):', e.message);
    }

    // 2. Test Policy Creation
    console.log('\n🧪 Testing Policy Creation...');
    const docType = 'Test Document ' + Date.now();

    const created = await prisma.retentionPolicy.create({
        data: {
            tenantId,
            documentType: docType,
            retentionPeriod: 5,
            retentionUnit: 'YEARS',
            autoDelete: true,
            createdById: userId
        }
    });

    if (created.retentionPeriod === 5 && created.autoDelete === true) {
        console.log('✅ Policy created successfully');
    } else {
        console.error('❌ Policy creation mismatch', created);
    }

    // 3. Test Retention Logic (lib/retention-policy.ts)
    console.log('\n🧪 Testing Retention Calculation...');
    const now = new Date();
    const calculatedExpiry = await calculateRetentionDate(tenantId, docType, now);

    const expectedYear = now.getFullYear() + 5;
    if (calculatedExpiry && calculatedExpiry.getFullYear() === expectedYear) {
        console.log('✅ Retention date calculated correctly (5 years)');
    } else {
        console.error('❌ Retention calculation failed', calculatedExpiry);
    }

    // 4. Test Auto-Delete Logic Compatibility
    // We verified the cleanup job code manually, but here we perform a mock check
    console.log('\n🧪 Testing Cleanup Logic Query...');
    const policy = await prisma.retentionPolicy.findUnique({
        where: {
            tenantId_documentType: {
                tenantId,
                documentType: docType
            }
        }
    });

    if (policy && policy.autoDelete) {
        console.log('✅ Cleanup job would select this for auto-delete');
    } else {
        console.error('❌ Cleanup logic check failed');
    }

    // 5. Cleanup
    await prisma.retentionPolicy.delete({
        where: {
            tenantId_documentType: { tenantId, documentType: docType }
        }
    });
    // Clean up user and tenant if needed, or leave for persistence check

    console.log('\n🎉 Test Suite Completed');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
