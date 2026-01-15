import { z } from 'zod';
import { LeadSchema, CaseSchema, DocumentUploadSchema } from '@/lib/validation/schemas';
import { Lead, Case, Document } from '@prisma/client';

export function createTypeGuard<T>(schema: z.ZodSchema<T>) {
    return (data: unknown): data is T => {
        const result = schema.safeParse(data);
        if (!result.success) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('Type guard validation failed:', result.error.errors);
            }
            return false;
        }
        return true;
    };
}

export const isLead = createTypeGuard<Lead>(LeadSchema as unknown as z.ZodSchema<Lead>);
export const isCase = createTypeGuard<Case>(CaseSchema as unknown as z.ZodSchema<Case>);
export const isDocument = createTypeGuard<Document>(DocumentUploadSchema as unknown as z.ZodSchema<Document>);

export const isLeadArray = createTypeGuard<Lead[]>(z.array(LeadSchema) as unknown as z.ZodSchema<Lead[]>);
export const isCaseArray = createTypeGuard<Case[]>(z.array(CaseSchema) as unknown as z.ZodSchema<Case[]>);

export interface ApiResponseValidationResult<T> {
    valid: boolean;
    data?: T;
    errors?: string[];
}

export function validateApiResponse<T>(schema: z.ZodSchema<T>, data: unknown): ApiResponseValidationResult<T> {
    const result = schema.safeParse(data);
    if (result.success) {
        return { valid: true, data: result.data };
    }
    return {
        valid: false,
        errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    };
}

export function assertApiResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new Error(`API Response Validation Failed: ${result.error.issues.map(i => i.message).join(', ')}`);
    }
    return result.data;
}
