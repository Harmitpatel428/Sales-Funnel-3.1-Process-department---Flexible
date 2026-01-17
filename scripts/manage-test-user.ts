
import { prisma } from '../lib/db';
import { hashPassword } from '../lib/auth';

const action = process.argv[2];
const username = process.argv[3];
const password = process.argv[4];

async function main() {
    if (!action || !username) {
        console.error('Usage: tsx scripts/manage-test-user.ts <create|delete> <username> [password]');
        process.exit(1);
    }

    try {
        if (action === 'create') {
            if (!password) {
                console.error('Password required for create');
                process.exit(1);
            }

            // Hash password
            const hashed = await hashPassword(password);

            // Create user
            // Check if exists first
            const existing = await prisma.user.findFirst({ where: { email: username + '@example.com' } });
            if (existing) {
                await prisma.user.delete({ where: { id: existing.id } });
            }

            await prisma.user.create({
                data: {
                    name: username,
                    email: username + '@example.com',
                    password: hashed,
                    role: 'USER', // Default role
                    // Add other required fields if any
                }
            });
            console.log('User created');

        } else if (action === 'delete') {
            const user = await prisma.user.findFirst({ where: { email: username + '@example.com' } });
            if (user) {
                await prisma.user.delete({ where: { id: user.id } });
                console.log('User deleted');
            } else {
                console.log('User not found, nothing to delete');
            }
        }
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
