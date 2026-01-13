import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '.prisma/client';
import bcrypt from 'bcryptjs';
import { seedPermissions } from './seeds/permissions';

// Use same path as prisma.config.ts: "file:./dev.db" (relative to project root)
const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Seeding database...');

    // Seed permissions
    await seedPermissions(prisma);

    // Create default admin user
    // YOU MUST CHANGE THIS PASSWORD AFTER FIRST LOGIN!
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    // Create default tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: 'default' },
        update: {},
        create: {
            name: 'Default Organization',
            slug: 'default',
            isActive: true,
        }
    });
    console.log(`✅ Default tenant: ${tenant.name} (${tenant.id})`);

    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            name: 'Administrator',
            email: process.env.ADMIN_EMAIL || 'admin@example.com',
            password: hashedPassword,
            role: 'ADMIN',
            isActive: true,
            tenantId: tenant.id
        },
    });

    console.log(`✅ Created admin user: ${admin.username} (ID: ${admin.id})`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: ${adminPassword} (CHANGE THIS IMMEDIATELY!)`);

    // Log the seeding event
    await prisma.auditLog.create({
        data: {
            actionType: 'SYSTEM_SEED',
            entityType: 'user',
            entityId: admin.id,
            description: 'Database seeded with initial admin user',
            performedByName: 'System',
            hash: 'seed-initial',
        },
    });

    console.log('✅ Database seeded successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
