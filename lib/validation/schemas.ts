import { z } from 'zod';

// ==========================================
// Enums
// ==========================================

export const LeadStatusEnum = z.enum([
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'PROPOSAL',
    'NEGOTIATION',
    'WON',
    'LOST'
]);

export const ProcessStatusEnum = z.enum([
    'DOCUMENTS_PENDING',
    'DOCUMENTS_RECEIVED',
    'VERIFICATION',
    'SUBMITTED',
    'QUERY_RAISED',
    'APPROVED',
    'REJECTED',
    'CLOSED'
]);

export const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const UnitTypeEnum = z.enum(['Manufacturing', 'Commercial', 'Industrial', 'Other']);
export const MandateStatusEnum = z.enum(['Pending', 'Signed', 'Rejected']);

// ==========================================
// Helper Schemas
// ==========================================

export const DateStringSchema = z.string().refine((val) => {
    // Allow empty string or valid date
    if (!val) return true;
    return !isNaN(Date.parse(val));
}, { message: "Invalid date format" });

export const JsonStringSchema = z.string().transform((str, ctx) => {
    try {
        return JSON.parse(str);
    } catch (e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON string" });
        return z.NEVER;
    }
});

// ==========================================
// Lead Schemas
// ==========================================

export const MobileNumberSchema = z.object({
    countryCode: z.string().optional(),
    number: z.string().min(10, "Phone number must be at least 10 digits"),
    type: z.enum(['Mobile', 'WhatsApp', 'Landline', 'Other']).optional().default('Mobile'),
    isPrimary: z.boolean().optional().default(false)
});

export const ActivitySchema = z.object({
    id: z.string().optional(),
    type: z.string(),
    description: z.string(),
    timestamp: z.string().or(z.date()),
    performedBy: z.string().optional()
});

export const LeadSchema = z.object({
    // Core Data
    // Core Data
    clientName: z.string().optional(),
    mobileNumber: z.string().optional(),
    email: z.string().email("Invalid email address").optional().or(z.literal('')),
    // phone: z.string().optional(), // Removed in favor of mobileNumber
    company: z.string().min(1, "Company name is required"),
    source: z.string().optional(),
    status: LeadStatusEnum.default('NEW'),
    notes: z.string().optional(),

    // Extended Fields
    kva: z.string().optional(),
    connectionDate: DateStringSchema.optional(),
    consumerNumber: z.string().optional(),
    discom: z.string().optional(),
    gidc: z.string().optional(),
    gstNumber: z.string().optional(),
    companyLocation: z.string().optional(),
    unitType: z.string().optional(),
    marketingObjective: z.string().optional(),
    budget: z.string().optional(),
    termLoan: z.string().optional(),
    timeline: z.string().optional(),
    contactOwner: z.string().optional(),

    // IDs & Flags
    assignedToId: z.string().optional(),
    createdById: z.string().optional(),
    isDone: z.boolean().optional(),
    mandateStatus: z.string().optional(),

    // JSON Fields (expecting parsed arrays/objects if coming from frontend JSON body)
    mobileNumbers: z.array(MobileNumberSchema).optional(),
    activities: z.array(ActivitySchema).optional(),
    customFields: z.record(z.string(), z.any()).optional(),
    submitted_payload: z.record(z.string(), z.any()).optional()
});

export const LeadUpdateSchema = LeadSchema.partial().extend({
    version: z.number().int().min(1, 'Version is required for updates').optional()
});

export const LeadFiltersSchema = z.object({
    status: z.union([z.string(), z.array(z.string())]).optional(),
    search: z.string().optional(),
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    assignedTo: z.string().optional(),
    isDone: z.coerce.boolean().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50)
});

export const AssignLeadSchema = z.object({
    leadId: z.string(),
    userId: z.string(),
    assignedBy: z.string()
});

export const ForwardToProcessSchema = z.object({
    leadId: z.string(),
    benefitTypes: z.array(z.string()).min(1, "At least one benefit type must be selected"),
    reason: z.string().optional(),
    deletedFrom: z.string().optional()
});

// ==========================================
// Case Schemas
// ==========================================

export const CaseSchema = z.object({
    leadId: z.string(),
    caseNumber: z.string(),
    schemeType: z.string().optional(),
    caseType: z.string().optional(),
    benefitTypes: z.array(z.string()).optional(),

    assignedProcessUserId: z.string().optional(),
    assignedRole: z.string().optional(),

    processStatus: ProcessStatusEnum.default('DOCUMENTS_PENDING'),
    priority: PriorityEnum.default('MEDIUM'),

    // Denormalized
    clientName: z.string().optional(),
    company: z.string().optional(),
    mobileNumber: z.string().optional(),
    consumerNumber: z.string().optional(),
    kva: z.string().optional(),

    // Extended
    contacts: z.array(z.any()).optional(),
    talukaCategory: z.string().optional(),
    termLoanAmount: z.string().optional(),
    plantMachineryValue: z.string().optional(),
    electricityLoad: z.string().optional(),
    electricityLoadType: z.string().optional(),

    originalLeadData: z.record(z.string(), z.any()).optional()
});

export const CaseUpdateSchema = CaseSchema.partial().extend({
    version: z.number().int().min(1, 'Version is required for updates').optional()
});

export const CaseFiltersSchema = z.object({
    status: z.union([z.string(), z.array(z.string())]).optional(),
    search: z.string().optional(),
    assignedTo: z.string().optional(),
    priority: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50)
});


// ==========================================
// Document Schemas
// ==========================================

export const DocumentUploadSchema = z.object({
    caseId: z.string().cuid(),
    documentType: z.string().min(1, "Document type is required"),
    fileName: z.string().min(1, "File name is required"),
    fileSize: z.number().positive().max(50 * 1024 * 1024, "File size limit is 50MB"),
    mimeType: z.string().regex(/^(application\/pdf|image\/(jpeg|png|jpg|gif|webp)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation)$/, "Unsupported file type"),
    notes: z.string().optional()
});

export const DocumentUpdateSchema = z.object({
    version: z.number().int().min(1, 'Version is required for updates').optional(),
    documentType: z.string().optional(),
    status: z.enum(['PENDING', 'RECEIVED', 'VERIFIED', 'REJECTED']).optional(),
    notes: z.string().optional(),
    rejectionReason: z.string().optional()
});

export const DocumentFiltersSchema = z.object({
    caseId: z.string().cuid().optional(),
    status: z.enum(['PENDING', 'RECEIVED', 'VERIFIED', 'REJECTED']).optional(),
    documentType: z.string().optional(),
    search: z.string().optional(), // Search in fileName, ocrText
    page: z.number().positive().optional().default(1),
    limit: z.number().positive().max(100).optional().default(50)
});

// ==========================================
// Validation Helper
// ==========================================

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data as T };
    } else {
        return {
            success: false,
            errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
        };
    }
}

