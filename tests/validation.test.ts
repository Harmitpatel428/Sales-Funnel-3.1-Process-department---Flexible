import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { LeadSchema, validateRequest } from '@/lib/validation/schemas';
import { validateLeadField, validateFieldWithZod, validateKva } from '@/app/hooks/useValidation';
import { generateBypassToken, validateBypassToken } from '@/lib/middleware/validation';
// Mock db
vi.mock('@/lib/db', () => ({
    prisma: {
        validationBypassLog: {
            create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
            findUnique: vi.fn(),
            update: vi.fn()
        }
    }
}));

describe('Validation Utilities', () => {
    describe('validateFieldWithZod', () => {
        const schema = z.object({
            name: z.string().min(3, "Name must be at least 3 chars"),
            age: z.number().min(18)
        });

        it('should return null for valid field', () => {
            const result = validateFieldWithZod(schema, 'name', 'John', {});
            expect(result).toBeNull();
        });

        it('should return error message for invalid field', () => {
            const result = validateFieldWithZod(schema, 'name', 'Jo', {});
            expect(result).toBe('Name must be at least 3 chars');
        });

        it('should validate correctly with context', () => {
            // Test cross-field if schema had refinement
            const refineSchema = z.object({
                a: z.number(),
                b: z.number()
            }).refine(data => data.a < data.b, { message: "a must be less than b", path: ['a'] });

            const result = validateFieldWithZod(refineSchema, 'a', 10, { a: 10, b: 5 }); // 10 < 5 is false
            expect(result).toBe("a must be less than b");
        });
    });

    describe('LeadSchema', () => {
        it('should validate a valid lead', () => {
            const validLead = {
                company: "Acme Corp",
                status: "NEW", // NEW exempt from notes? Yes from my change.
            };
            const result = LeadSchema.safeParse(validLead);
            expect(result.success).toBe(true);
        });

        it('should require notes for CONTACTED status', () => {
            const lead = {
                company: "Acme Corp",
                status: "CONTACTED",
                email: "test@example.com" // Email required for CONTACTED
            };
            const result = LeadSchema.safeParse(lead);
            expect(result.success).toBe(false);
            const notesError = result.error?.issues.find(i => i.path.includes('notes'));
            expect(notesError).toBeDefined();
        });
    });

    describe('validateLeadField', () => {
        it('should use Zod schema for standard fields', () => {
            const lead = {
                company: "Acme",
                status: "NEW", // Valid
                email: "invalid-email" // Invalid
            };
            const error = validateLeadField('email', 'invalid-email', lead as any);
            // LeadSchema -> email field validation
            expect(error).toContain('Invalid email address');
        });

        it('should bypass Zod for unknown fields', () => {
            const lead = { status: 'NEW' };
            const error = validateLeadField('unknown_field' as any, 'some val', lead as any);
            expect(error).toBeNull();
        });
    });

    describe('useValidation hooks', () => {
        it('validateKva should require value', () => {
            expect(validateKva('')).toBe('KVA is required');
            expect(validateKva('100')).toBeNull();
        });
    });
});
