import { prisma } from '../lib/db';

async function main() {
    const users = await prisma.user.findMany({
        select: { email: true, name: true, role: true, isActive: true },
        take: 5
    });
    console.log('Available Users for Sign-in:');
    users.forEach(u => console.log(`- ${u.email} (Role: ${u.role}, Active: ${u.isActive})`));

    console.log('\nDefault password for seeded users is typically: password123 or test123');
}
main();
