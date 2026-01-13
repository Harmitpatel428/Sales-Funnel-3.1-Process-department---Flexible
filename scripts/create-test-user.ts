import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
    console.log("Starting test user creation...");
    const email = 'testuser@example.com';
    const password = 'correct_password';

    console.log(`Hashing password for ${email}...`);
    const passwordHash = await bcrypt.hash(password, 12);

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`User ${email} exists (ID: ${existing.id}), updating password...`);
        await prisma.user.update({
            where: { email },
            data: {
                password: passwordHash,
                lockedUntil: null,
                failedLoginAttempts: 0
            }
        });
    } else {
        console.log(`User ${email} not found. Creating...`);
        // We need a tenant first
        let tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            console.log("No tenant found, creating default tenant...");
            tenant = await prisma.tenant.create({
                data: {
                    name: "Default Tenant",
                    slug: "default-tenant",
                    subdomain: "default",
                    subscriptionTier: "ENTERPRISE"
                }
            });
        }

        await prisma.user.create({
            data: {
                email,
                username: 'testuser',
                name: 'Test User',
                role: 'SALES_EXECUTIVE',
                tenantId: tenant.id,
                password: passwordHash,
                isActive: true,
            }
        });
        console.log("User created.");
    }
    console.log("Test user setup complete.");
}

main()
    .catch(e => {
        console.error("Error creating test user:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
