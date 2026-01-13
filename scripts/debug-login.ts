import { prisma } from '../lib/db';
import { verifyPassword, isAccountLocked, generateSessionToken } from '../lib/auth';

// Parse command-line arguments
const args = process.argv.slice(2);
const usernameArg = args.find(a => a.startsWith('--username='))?.split('=')[1];
const passwordArg = args.find(a => a.startsWith('--password='))?.split('=')[1];

async function main() {
    console.log('🔍 Comprehensive Login Debug...\n');

    const username = usernameArg || 'admin';
    const password = passwordArg || 'Admin@123456';

    console.log(`Testing login for: ${username}`);
    console.log('='.repeat(50));

    // 1. Database health check
    console.log('\n📊 Step 1: Database Health Check');
    try {
        const userCount = await prisma.user.count();
        const tenantCount = await prisma.tenant.count();
        const sessionCount = await prisma.session.count();
        console.log(`   ✅ Database connected`);
        console.log(`   📈 Users: ${userCount}, Tenants: ${tenantCount}, Sessions: ${sessionCount}`);
    } catch (error) {
        console.log(`   ❌ Database connection failed:`, error);
        return;
    }

    // 2. User lookup with full details
    console.log('\n👤 Step 2: User Lookup');
    const user = await prisma.user.findUnique({
        where: { username },
        include: {
            tenant: true,
            customRole: true,
        }
    });

    if (!user) {
        console.log(`   ❌ User '${username}' not found`);
        console.log('\n📋 Available users:');
        const users = await prisma.user.findMany({
            select: { username: true, email: true, role: true, isActive: true }
        });
        users.forEach(u => {
            console.log(`      - ${u.username} (${u.email}) [${u.role}] ${u.isActive ? '✓ Active' : '✗ Inactive'}`);
        });
        return;
    }

    console.log(`   ✅ User found: ${user.username}`);
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   👤 Name: ${user.name}`);
    console.log(`   🎭 Role: ${user.role}${user.customRole ? ` (Custom: ${user.customRole.name})` : ''}`);
    console.log(`   🏢 Tenant: ${user.tenant?.name || 'N/A'} (ID: ${user.tenantId})`);

    // 3. Account status checks
    console.log('\n🔒 Step 3: Account Status Checks');
    console.log(`   Active: ${user.isActive ? '✅ Yes' : '❌ No'}`);
    console.log(`   MFA Enabled: ${user.mfaEnabled ? '✅ Yes' : '⚪ No'}`);
    console.log(`   SSO Provider: ${user.ssoProvider || 'None'}`);
    console.log(`   Failed Attempts: ${user.failedLoginAttempts}`);
    console.log(`   Locked Until: ${user.lockedUntil ? user.lockedUntil.toISOString() : 'Not locked'}`);
    console.log(`   Password Expires: ${user.passwordExpiresAt ? user.passwordExpiresAt.toISOString() : 'No expiry set'}`);
    console.log(`   Last Login: ${user.lastLoginAt ? user.lastLoginAt.toISOString() : 'Never'}`);

    // Check if account is locked
    const locked = await isAccountLocked(user.id);
    if (locked) {
        console.log(`   ❌ Account is currently LOCKED`);
    }

    // 4. Password verification
    console.log('\n🔐 Step 4: Password Verification');
    console.log(`   Password Hash: ${user.password.substring(0, 20)}...`);
    const isMatch = await verifyPassword(password, user.password);
    console.log(`   Password Match: ${isMatch ? '✅ Valid' : '❌ Invalid'}`);

    if (!isMatch) {
        console.log('\n❌ Login would fail: Invalid password');
        return;
    }

    // 5. Tenant validation
    console.log('\n🏢 Step 5: Tenant Validation');
    if (!user.tenantId) {
        console.log('   ❌ User has no tenant association!');
    } else if (!user.tenant) {
        console.log('   ❌ Tenant not found in database!');
    } else if (!user.tenant.isActive) {
        console.log('   ❌ Tenant is inactive!');
    } else {
        console.log(`   ✅ Tenant valid: ${user.tenant.name}`);
    }

    // 6. Session creation test
    console.log('\n🎟️ Step 6: Session Token Generation Test');
    try {
        const testToken = await generateSessionToken(user.id, user.role);
        console.log(`   ✅ Token generated: ${testToken.substring(0, 30)}...`);
    } catch (error) {
        console.log(`   ❌ Token generation failed:`, error);
    }

    // 7. Check existing sessions
    console.log('\n📝 Step 7: Existing Sessions');
    const sessions = await prisma.session.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
    });
    if (sessions.length === 0) {
        console.log('   No existing sessions');
    } else {
        console.log(`   Found ${sessions.length} session(s):`);
        sessions.forEach(s => {
            const status = s.isValid && s.expiresAt > new Date() ? '✅ Valid' : '❌ Expired/Invalid';
            console.log(`      - ${status} | Created: ${s.createdAt.toISOString()} | Expires: ${s.expiresAt.toISOString()}`);
        });
    }

    // 8. Permission loading test (if applicable)
    console.log('\n🔑 Step 8: Permission Check');
    const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId: user.roleId || undefined },
        include: { permission: true }
    });
    if (rolePermissions.length > 0) {
        console.log(`   Found ${rolePermissions.length} permission(s) for custom role`);
    } else if (user.roleId) {
        console.log('   ⚠️ Custom role has no permissions assigned');
    } else {
        console.log('   Using default role-based permissions');
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));

    const issues: string[] = [];
    if (!user.isActive) issues.push('Account is inactive');
    if (locked) issues.push('Account is locked');
    if (!isMatch) issues.push('Password is incorrect');
    if (!user.tenantId) issues.push('No tenant association');
    if (user.passwordExpiresAt && user.passwordExpiresAt < new Date()) issues.push('Password has expired');

    if (issues.length === 0 && isMatch) {
        console.log('✅ LOGIN WOULD SUCCEED');
        console.log('\nTo simulate full login flow, run:');
        console.log(`   curl -X POST http://localhost:3000/api/auth/login \\`);
        console.log(`        -H "Content-Type: application/json" \\`);
        console.log(`        -d '{"username": "${username}", "password": "${password}"}'`);
    } else {
        console.log('❌ LOGIN WOULD FAIL');
        console.log('\nIssues found:');
        issues.forEach(i => console.log(`   - ${i}`));
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('Debug script error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
