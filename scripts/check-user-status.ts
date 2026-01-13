
import { prisma } from '../lib/db';

async function main() {
    console.log('Checking test user status...');
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: 'testuser@example.com' },
                { username: 'testuser' }
            ]
        }
    });

    if (user) {
        console.log('User found:');
        console.log(`- ID: ${user.id}`);
        console.log(`- Username: ${user.username}`);
        console.log(`- Email: ${user.email}`);
        console.log(`- Role: ${user.role}`);
        console.log(`- Active: ${user.isActive}`);
        console.log(`- Locked Until: ${user.lockedUntil}`);
        console.log(`- Failed Attempts: ${user.failedLoginAttempts}`);
    } else {
        console.log('User NOT found.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
