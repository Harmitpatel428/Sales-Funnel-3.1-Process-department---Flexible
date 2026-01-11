import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '.prisma/client';

// Use DATABASE_PATH from environment (set by Electron in production) or fallback to local dev.db
// In production Electron, this will be set to app.getPath('userData')/database/app.db
const dbPath = process.env.DATABASE_PATH || './dev.db';
// Singleton pattern for PrismaClient to avoid multiple instances in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;
