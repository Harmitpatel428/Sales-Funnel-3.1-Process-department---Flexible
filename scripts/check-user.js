const { loginAction } = require('./app/actions/auth');
const { prisma } = require('./lib/db');

// Mock next/headers
jest.mock('next/headers', () => ({
    headers: () => ({
        get: () => 'mock-user-agent'
    }),
    cookies: () => ({
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn()
    })
}));

// We can't easily run server actions in isolation with simple node script if they import 'server-only' things or rely on nextjs build.
// But we can check DB directly.

async function checkUser() {
    console.log('Checking database for admin user...');
    try {
        const user = await prisma.user.findUnique({
            where: { username: 'admin' }
        });

        if (user) {
            console.log('✅ User "admin" found.');
            console.log('   ID:', user.id);
            console.log('   Role:', user.role);
            console.log('   Hash start:', user.password.substring(0, 10) + '...');
            console.log('   IsActive:', user.isActive);
            console.log('   LockedUntil:', user.lockedUntil);
        } else {
            console.log('❌ User "admin" NOT found.');
        }
    } catch (e) {
        console.error('Error querying DB:', e);
    }
}

checkUser();
