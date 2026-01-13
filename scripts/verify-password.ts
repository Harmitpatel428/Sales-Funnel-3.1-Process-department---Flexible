
import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
    console.log('Verifying password for testuser (direct bcrypt)...');
    const user = await prisma.user.findFirst({
        where: { username: 'testuser' }
    });

    if (!user) {
        console.error('User not found!');
        return;
    }

    const testPassword = 'correct_password';
    console.log(`Testing password: '${testPassword}' against hash...`);
    const isValid = await bcrypt.compare(testPassword, user.password);

    console.log(`Password verification result: ${isValid}`);
    if (isValid) {
        console.log('SUCCESS: The stored password hash MATCHES "correct_password".');
    } else {
        console.log('FAILURE: The stored password hash DOES NOT match "correct_password".');

        // Update it to correct one
        console.log('Fixing password now...');
        const newHash = await bcrypt.hash(testPassword, 12);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: newHash,
                failedLoginAttempts: 0,
                lockedUntil: null
            }
        });
        console.log('Password updated to "correct_password".');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
