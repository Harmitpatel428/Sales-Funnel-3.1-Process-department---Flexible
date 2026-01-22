import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';

// Singleton Prisma instance
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Initialize Better SQLite3 with connection options
const connectionString = process.env.DATABASE_PATH || './dev.db';
// Remove 'file:' prefix for better-sqlite3 as it expects just the path usually
const dbPath = connectionString.replace('file:', '');

const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    timeout: 5000 // 5 seconds
});

// Configure connection pool (SQLite is single-file, but we can manage concurrent access)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Try to initialize with adapter, fallback to standard if it fails (common in dev HMR)
let prismaInstance: PrismaClient;

try {
    // Only use adapter if explicitly supported/enabled to avoid instantiation errors
    const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });
    prismaInstance = new PrismaClient({ adapter });
} catch (e) {
    console.warn('Failed to initialize Prisma adapter, falling back to standard client', e);
    prismaInstance = new PrismaClient({
        datasources: {
            db: {
                url: 'file:' + dbPath
            }
        }
    });
}

export const prisma = globalForPrisma.prisma || prismaInstance;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const dbInstance = db;

// Health check function (synchronous - uses better-sqlite3 directly)
export function checkDatabaseHealth() {
    try {
        const result = db.prepare('SELECT 1').get();
        return !!result;
    } catch (e) {
        console.error('Database health check failed:', e);
        return false;
    }
}

// Async health check function (uses Prisma)
export async function isDatabaseHealthy(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch (e) {
        console.error('[Database] Health check failed:', e);
        return false;
    }
}
