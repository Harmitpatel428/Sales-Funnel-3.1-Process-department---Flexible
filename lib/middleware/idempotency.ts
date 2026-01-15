import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export interface IdempotencyOptions {
    expiryHours?: number; // Default 24 hours
}

export async function idempotencyMiddleware(
    req: NextRequest,
    tenantId: string,
    body?: string,
    options: IdempotencyOptions = {}
) {
    // Only apply to write operations
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return null;
    }

    const idempotencyKey = req.headers.get('Idempotency-Key');

    // Idempotency key is optional but recommended
    if (!idempotencyKey) {
        return null;
    }

    // Validate key format (UUID or similar)
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
        return NextResponse.json(
            {
                success: false,
                message: 'Invalid Idempotency-Key format. Must be 16-128 alphanumeric characters.'
            },
            { status: 400 }
        );
    }

    const endpoint = req.nextUrl.pathname;
    const expiryHours = options.expiryHours || 24;

    // Generate request hash (body + method + endpoint)
    const requestBody = body ?? await req.clone().text();
    const requestHash = crypto
        .createHash('sha256')
        .update(`${req.method}:${req.nextUrl.pathname}:${requestBody}`)
        .digest('hex');

    // Check for existing operation
    const existing = await prisma.idempotencyLog.findUnique({
        where: { key: idempotencyKey }
    });

    if (existing) {
        // Verify tenant isolation
        if (existing.tenantId !== tenantId) {
            return NextResponse.json(
                { success: false, message: 'Idempotency key conflict' },
                { status: 409 }
            );
        }

        // Check if request is identical
        if (existing.requestHash !== requestHash) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Idempotency key reused with different request body'
                },
                { status: 422 }
            );
        }

        // Return cached response
        return new NextResponse(existing.responseBody, {
            status: existing.responseStatus,
            headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Replay': 'true'
            }
        });
    }

    // Store metadata for later use
    (req as any).idempotencyContext = {
        key: idempotencyKey,
        tenantId,
        endpoint,
        requestHash,
        expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000)
    };

    return null;
}

export async function storeIdempotencyResult(
    req: NextRequest,
    response: NextResponse
) {
    const context = (req as any).idempotencyContext;
    if (!context) return;

    try {
        const responseBody = await response.clone().text();

        await prisma.idempotencyLog.create({
            data: {
                key: context.key,
                tenantId: context.tenantId,
                endpoint: context.endpoint,
                requestHash: context.requestHash,
                responseStatus: response.status,
                responseBody,
                expiresAt: context.expiresAt
            }
        });
    } catch (error) {
        console.error('Failed to store idempotency result:', error);
        // Don't fail the request if logging fails
    }
}
