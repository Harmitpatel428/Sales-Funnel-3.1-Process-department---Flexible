import { prisma } from '../lib/db';
import crypto from 'crypto';

async function createTestApiKey() {
    try {
        // Get first tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            console.log('ERROR: No tenant found');
            process.exit(1);
        }

        // Get first user
        const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
        if (!user) {
            console.log('ERROR: No user found');
            process.exit(1);
        }

        // Check if test key already exists
        const existing = await prisma.apiKey.findFirst({
            where: { name: 'Test API Key', tenantId: tenant.id }
        });

        if (existing) {
            console.log('Test API key already exists, deleting and recreating...');
            await prisma.apiKey.delete({ where: { id: existing.id } });
        }

        // Generate API key
        const rawKey = crypto.randomBytes(32).toString('hex');
        const keyPrefix = 'sk_test_' + rawKey.substring(0, 8);
        const fullKey = keyPrefix + rawKey.substring(8);
        const hashedKey = crypto.createHash('sha256').update(fullKey).digest('hex');

        // Create API key
        const apiKey = await prisma.apiKey.create({
            data: {
                name: 'Test API Key',
                key: hashedKey,
                keyPrefix: keyPrefix,
                tenantId: tenant.id,
                userId: user.id,
                scopes: JSON.stringify(['leads:read', 'leads:write', 'leads:delete', 'cases:read', 'cases:write', 'admin']),
                rateLimit: 1000,
                environment: 'sandbox',
                description: 'API key for automated testing',
            },
        });

        console.log('SUCCESS');
        console.log('TEST_API_KEY=' + fullKey);
        console.log('API_KEY_ID=' + apiKey.id);
        console.log('TENANT_ID=' + tenant.id);
    } catch (error: any) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

createTestApiKey();
