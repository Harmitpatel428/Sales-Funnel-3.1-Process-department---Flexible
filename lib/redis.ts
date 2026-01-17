import { prisma } from './db';

// Redis client interface
export interface RedisClient {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
    del(key: string): Promise<number>;
    lpush(key: string, ...values: string[]): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    ltrim(key: string, start: number, stop: number): Promise<string>;
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
}

// In-memory fallback for development
class InMemoryRedis implements RedisClient {
    private store = new Map<string, any>();

    async incr(key: string): Promise<number> {
        const val = (this.store.get(key) || 0) + 1;
        this.store.set(key, val);
        return val;
    }

    async expire(key: string, seconds: number): Promise<number> {
        // Mock implementation
        return 1;
    }

    async ttl(key: string): Promise<number> {
        return 3600;
    }

    async get(key: string): Promise<string | null> {
        const val = this.store.get(key);
        return val !== undefined ? String(val) : null;
    }

    async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
        this.store.set(key, value);
        return 'OK';
    }

    async del(key: string): Promise<number> {
        return this.store.delete(key) ? 1 : 0;
    }

    async lpush(key: string, ...values: string[]): Promise<number> {
        let list = this.store.get(key) || [];
        if (!Array.isArray(list)) list = [];
        list.unshift(...values);
        this.store.set(key, list);
        return list.length;
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        const list = this.store.get(key) || [];
        if (!Array.isArray(list)) return [];
        // Handle negative indices if needed, but simple slice for now
        const end = stop < 0 ? list.length + stop + 1 : stop + 1;
        return list.slice(start, end);
    }

    async ltrim(key: string, start: number, stop: number): Promise<string> {
        const list = this.store.get(key) || [];
        if (!Array.isArray(list)) return 'OK';
        const end = stop < 0 ? list.length + stop + 1 : stop + 1;
        this.store.set(key, list.slice(start, end));
        return 'OK';
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        let set = this.store.get(key) || new Set<string>();
        if (!(set instanceof Set)) set = new Set<string>();
        let added = 0;
        for (const m of members) {
            if (!set.has(m)) {
                set.add(m);
                added++;
            }
        }
        this.store.set(key, set);
        return added;
    }

    async srem(key: string, ...members: string[]): Promise<number> {
        const set = this.store.get(key);
        if (!(set instanceof Set)) return 0;
        let removed = 0;
        for (const m of members) {
            if (set.delete(m)) {
                removed++;
            }
        }
        return removed;
    }

    async smembers(key: string): Promise<string[]> {
        const set = this.store.get(key);
        if (!(set instanceof Set)) return [];
        return Array.from(set);
    }
}

let redisClient: RedisClient | null = null;

export async function getRedisClient(): Promise<RedisClient> {
    if (redisClient) return redisClient;

    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        try {
            const Redis = (await import('ioredis')).default;
            redisClient = new Redis(redisUrl) as any;
        } catch (error) {
            console.warn('[Redis] Connection failed, using in-memory');
            redisClient = new InMemoryRedis();
        }
    } else {
        redisClient = new InMemoryRedis();
    }

    return redisClient;
}
