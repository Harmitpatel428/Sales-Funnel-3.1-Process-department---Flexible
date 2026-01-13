import { prisma } from '../lib/db';

async function main() {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            email: true,
            name: true,
            isActive: true,
            role: true
        }
    });
    console.log('Users in database:');
    users.forEach(u => {
        console.log(`- Username: ${u.username}, Email: ${u.email}, Role: ${u.role}, Active: ${u.isActive}`);
    });
}
main();
