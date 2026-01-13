
import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
    console.log("Starting ADMIN user creation...");
    const email = 'admin@example.com';
    const username = 'admin';
    const password = 'Admin_Secure_Password1!'; // Strong password

    console.log(`Hashing password for ${username}...`);
    const passwordHash = await bcrypt.hash(password, 12);

    // Check if user exists by email or username
    const existing = await prisma.user.findFirst({
        where: {
            OR: [
                { email },
                { username }
            ]
        }
    });

    if (existing) {
        console.log(`Admin user (ID: ${existing.id}) already exists.`);
        console.log("Updating password and ensuring ADMIN role...");

        await prisma.user.update({
            where: { id: existing.id },
            data: {
                password: passwordHash,
                role: 'ADMIN',
                isActive: true,
                failedLoginAttempts: 0,
                lockedUntil: null
            }
        });
        console.log("Admin user updated.");
    } else {
        console.log("Admin user not found. Creating...");

        // Ensure tenant exists
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
                username,
                name: 'System Administrator',
                role: 'ADMIN',
                tenantId: tenant.id,
                password: passwordHash,
                isActive: true,
            }
        });
        console.log("Admin user created.");
    }

    console.log("\n=============================================");
    console.log("ADMIN CREDENTIALS CREATED/UPDATED:");
    console.log(`Username: ${username}`);
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log("=============================================\n");
}

main()
    .catch(e => {
        console.error("Error creating admin user:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
