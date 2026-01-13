import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateToMultiTenant() {
    console.log('Starting multi-tenant migration...');

    // Check if default tenant already exists
    const existingTenant = await prisma.tenant.findFirst({
        where: { slug: 'default' },
    });

    let defaultTenant;
    if (existingTenant) {
        console.log(`Default tenant already exists: ${existingTenant.id}`);
        defaultTenant = existingTenant;
    } else {
        // Create default tenant
        defaultTenant = await prisma.tenant.create({
            data: {
                name: 'Default Organization',
                slug: 'default',
                subscriptionTier: 'ENTERPRISE',
                subscriptionStatus: 'ACTIVE',
            },
        });
        console.log(`Created default tenant: ${defaultTenant.id}`);
    }

    // Update all existing User records with default tenant ID (where tenantId is null/missing)
    const usersUpdated = await prisma.$executeRaw`
    UPDATE users SET tenantId = ${defaultTenant.id} WHERE tenantId IS NULL OR tenantId = ''
  `;
    console.log(`Updated ${usersUpdated} user records`);

    // Update all existing Lead records
    const leadsUpdated = await prisma.$executeRaw`
    UPDATE leads SET tenantId = ${defaultTenant.id} WHERE tenantId IS NULL OR tenantId = ''
  `;
    console.log(`Updated ${leadsUpdated} lead records`);

    // Update all existing AuditLog records (optional field but we'll set it for existing records)
    const auditLogsUpdated = await prisma.$executeRaw`
    UPDATE audit_logs SET tenantId = ${defaultTenant.id} WHERE tenantId IS NULL OR tenantId = ''
  `;
    console.log(`Updated ${auditLogsUpdated} audit log records`);

    // Update all existing SavedView records
    const savedViewsUpdated = await prisma.$executeRaw`
    UPDATE saved_views SET tenantId = ${defaultTenant.id} WHERE tenantId IS NULL OR tenantId = ''
  `;
    console.log(`Updated ${savedViewsUpdated} saved view records`);

    // Update all existing Session records
    const sessionsUpdated = await prisma.$executeRaw`
    UPDATE sessions SET tenantId = ${defaultTenant.id} WHERE tenantId IS NULL OR tenantId = ''
  `;
    console.log(`Updated ${sessionsUpdated} session records`);

    console.log('Migration completed successfully!');
    console.log(`\nDefault Tenant ID: ${defaultTenant.id}`);
    console.log('You can set this in your .env file as DEFAULT_TENANT_ID');
}

migrateToMultiTenant()
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
