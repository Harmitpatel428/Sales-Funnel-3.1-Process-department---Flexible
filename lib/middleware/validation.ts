import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma as db } from '@/lib/db';
import { randomUUID } from 'crypto';

// ==========================================
// Types
// ==========================================

export interface ValidationOptions {
    skipFields?: string[];
    allowPartial?: boolean;
    auditBypass?: boolean;
}

export interface ValidationErrorResponse {
    success: false;
    error: 'VALIDATION_ERROR';
    message: string;
    errors: Array<{ field: string; message: string; code: string }>;
}

export interface ValidatedRequest<T> extends NextRequest {
    validatedData: T;
}

// ==========================================
// Error Formatting
// ==========================================

export function formatValidationErrors(zodError: z.ZodError): ValidationErrorResponse {
    const errors = zodError.issues.map((issue) => {
        let code = 'INVALID_VALUE';
        if (issue.code === z.ZodIssueCode.invalid_type) code = 'INVALID_TYPE';
        if (issue.code === z.ZodIssueCode.too_small) code = 'VALUE_TOO_SMALL';
        if (issue.code === z.ZodIssueCode.too_big) code = 'VALUE_TOO_LARGE';
        if (issue.message.includes('required')) code = 'REQUIRED_FIELD';

        return {
            field: issue.path.join('.'),
            message: issue.message,
            code
        };
    });

    return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors
    };
}

// ==========================================
// Bypass Token Logic
// ==========================================



const BYPASS_HEADER = 'X-Validation-Bypass-Token';

export async function generateBypassToken(operation: string, userId: string, tenantId: string, endpoint: string, reason: string): Promise<string> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.validationBypassLog.create({
        data: {
            token,
            tenantId,
            userId,
            endpoint,
            reason,
            expiresAt
        }
    });

    return token;
}

export async function validateBypassToken(token: string) {
    try {
        const log = await db.validationBypassLog.findUnique({
            where: { token }
        });

        if (!log) return { valid: false, operation: null, userId: null };

        if (new Date() > log.expiresAt) {
            return { valid: false, operation: null, userId: null };
        }

        // Token is valid
        return {
            valid: true,
            operation: log.reason, // using reason as operation name
            userId: log.userId,
            logId: log.id
        };
    } catch (e) {
        console.error("Bypass validation error:", e);
        return { valid: false, operation: null, userId: null };
    }
}

// ==========================================
// Middleware HOF
// ==========================================

type RouteHandler<T> = (req: ValidatedRequest<T>, context?: any) => Promise<NextResponse>;

export function withValidation<T>(schema: z.ZodSchema<T>, options: ValidationOptions = {}) {
    return (handler: RouteHandler<T>) => {
        return async (req: NextRequest, context?: any) => {
            // Check for Bypass
            const bypassToken = req.headers.get(BYPASS_HEADER);
            if (bypassToken) {
                const { valid, operation, userId, logId } = await validateBypassToken(bypassToken);
                if (valid && logId) {
                    console.log(`[Validation Bypass] Operation: ${operation}, User: ${userId}`);

                    // Mark as used
                    await db.validationBypassLog.update({
                        where: { id: logId },
                        data: { usedAt: new Date() }
                    }).catch(console.error);

                    // Proceed without validation logic (or with permissive validation)
                    try {
                        let data;
                        if (req.method === 'GET') {
                            const url = new URL(req.url);
                            const queryData: Record<string, any> = {};
                            url.searchParams.forEach((value, key) => {
                                if (queryData[key]) {
                                    if (Array.isArray(queryData[key])) {
                                        queryData[key].push(value);
                                    } else {
                                        queryData[key] = [queryData[key], value];
                                    }
                                } else {
                                    queryData[key] = value;
                                }
                            });
                            data = queryData;
                        } else {
                            data = await req.json(); // Consumes body! 
                        }
                        (req as ValidatedRequest<any>).validatedData = data;
                        return handler(req as ValidatedRequest<T>, context);
                    } catch (e) {
                        return NextResponse.json({ success: false, error: 'INVALID_JSON_BODY' }, { status: 400 });
                    }
                }
            }

            // Normal Validation
            let data: unknown;
            try {
                if (req.method === 'GET') {
                    const url = new URL(req.url);
                    const queryData: Record<string, any> = {};
                    url.searchParams.forEach((value, key) => {
                        if (queryData[key]) {
                            if (Array.isArray(queryData[key])) {
                                queryData[key].push(value);
                            } else {
                                queryData[key] = [queryData[key], value];
                            }
                        } else {
                            queryData[key] = value;
                        }
                    });
                    data = queryData;
                    // Convert query params (strings) to numbers/booleans if needed by schema?
                    // Zod 'coerce' handles this if used.
                } else if (req.headers.get('content-type')?.includes('application/json')) {
                    // We must clone because reading body consumes it
                    // But if we attach data to req, the handler validatesData.
                    const clone = req.clone();
                    data = await clone.json();
                } else {
                    // No body or FormData (not handled yet)
                    data = {};
                }
            } catch (e) {
                return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
            }

            let validationResult;
            if (options.allowPartial && schema instanceof z.ZodObject) {
                // @ts-ignore
                validationResult = schema.partial().safeParse(data);
            } else {
                validationResult = schema.safeParse(data);
            }

            if (!validationResult.success) {
                const formatted = formatValidationErrors(validationResult.error);
                return NextResponse.json(formatted, { status: 400 });
            }

            // Attach validated data
            (req as ValidatedRequest<T>).validatedData = validationResult.data;

            return handler(req as ValidatedRequest<T>, context);
        };
    };
}
