import { NextRequest } from 'next/server';

export function logRequest(req: NextRequest, session: any | null) {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.nextUrl.pathname;
    const userId = session?.userId || 'anonymous';
    const tenantId = session?.tenantId || 'unknown';
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    console.log(`[${timestamp}] ${method} ${path} User:${userId} Tenant:${tenantId} IP:${ip}`);
}
