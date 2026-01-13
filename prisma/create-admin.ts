import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function createAdmin() {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const hash = await bcrypt.hash(adminPassword, 12);

    // Create tenant if not exists
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                name: 'Default Tenant',
                slug: 'default',
                isActive: true,
            },
        });
        console.log('Created tenant:', tenant.id);
    }

    // Check if admin exists by username first (fallback lookup)
    const existingAdmin = await prisma.user.findUnique({
        where: { username: 'admin' },
    });

    // Create or update admin user
    const user = await prisma.user.upsert({
        where: { email: existingAdmin?.email || adminEmail },
        create: {
            email: adminEmail,
            username: 'admin',
            name: 'Admin User',
            password: hash,
            role: 'ADMIN',
            tenantId: tenant.id,
            isActive: true,
        },
        update: { password: hash, email: adminEmail },
    });

    console.log('\n✅ Admin user created/updated!');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword} (CHANGE THIS IMMEDIATELY!)`);
    console.log('   User ID:', user.id);
}

createAdmin()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
