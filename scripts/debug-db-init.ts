
import { prisma, checkDatabaseHealth } from '../lib/db';
import { getSession } from '../lib/auth';
import { requirePermissions } from '../lib/middleware/permissions';
import { TriggerManager } from '../lib/workflows/triggers';
import { rateLimitMiddleware } from '../lib/middleware/rate-limiter';


async function main() {
    console.log('Testing DB initialization...');
    try {
        const health = checkDatabaseHealth();
        console.log('DB Health:', health);

        console.log('Querying User count...');
        const count = await prisma.user.count();
        console.log('User count:', count);

        console.log('DB Init Success');
    } catch (error) {
        console.error('DB Init Failed:', error);
        process.exit(1);
    }
}

main();
