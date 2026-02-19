/**
 * Workflow Validation Schemas
 * Zod schemas for validating workflow configurations
 */

import { z } from 'zod';

// Trigger types
export const TriggerTypeSchema = z.enum([
    'ON_CREATE',
    'ON_UPDATE',
    'ON_STATUS_CHANGE',
    'SCHEDULED',
    'MANUAL'
]);

// Entity types
export const EntityTypeSchema = z.enum(['LEAD', 'CASE']);

// Trigger configuration
export const TriggerConfigSchema = z.object({
    watchFields: z.array(z.string()).optional(),
    fromStatus: z.array(z.string()).optional(),
    toStatus: z.array(z.string()).optional(),
    cronExpression: z.string().optional(),
    conditions: z.array(z.object({
        field: z.string(),
        operator: z.string(),
        value: z.unknown()
    })).optional()
});

// Action types
export const ActionTypeSchema = z.enum([

    'ASSIGN_USER',
    'UPDATE_FIELD',
    'CREATE_TASK',
    'WEBHOOK',
    'WAIT',
    'APPROVAL',
    'UPDATE_LEAD_SCORE',
    'ESCALATE'
]);

// Condition types
export const ConditionTypeSchema = z.enum(['IF', 'ELSE_IF', 'ELSE', 'AND', 'OR']);

// Action configuration schemas


export const AssignUserConfigSchema = z.object({
    userId: z.string().optional(),
    strategy: z.enum(['ROUND_ROBIN', 'LEAST_LOADED', 'TERRITORY_BASED', 'SKILL_BASED', 'WEIGHTED']).optional(),
    filters: z.object({
        role: z.array(z.string()).optional(),
        territory: z.string().optional(),
        maxActiveLeads: z.number().optional()
    }).optional(),
    fallback: z.string().optional()
});

export const UpdateFieldConfigSchema = z.object({
    field: z.string(),
    value: z.unknown()
});

export const CreateTaskConfigSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    assignedTo: z.string().optional(),
    dueDate: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional()
});

export const WebhookConfigSchema = z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    headers: z.record(z.string()).optional(),
    body: z.record(z.unknown()).optional(),
    authentication: z.object({
        type: z.enum(['API_KEY', 'BEARER', 'BASIC']),
        apiKey: z.string().optional(),
        apiKeyHeader: z.string().optional(),
        token: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional()
    }).optional()
});

export const WaitConfigSchema = z.object({
    duration: z.number().optional(),
    until: z.string().optional()
});

export const ApprovalConfigSchema = z.object({
    approverIds: z.array(z.string()),
    approvalType: z.enum(['ANY', 'ALL', 'MAJORITY']),
    expiresIn: z.number().optional(),
    message: z.string().optional()
});

// Condition configuration
export const ConditionConfigSchema = z.object({
    field: z.string().optional(),
    operator: z.string().optional(),
    value: z.unknown().optional(),
    conditions: z.array(z.lazy(() => ConditionConfigSchema)).optional()
});

// Workflow step schema
export const WorkflowStepSchema = z.object({
    id: z.string().optional(),
    stepType: z.enum(['CONDITION', 'ACTION']),
    stepOrder: z.number(),
    actionType: ActionTypeSchema.optional(),
    actionConfig: z.record(z.unknown()).default({}),
    conditionType: ConditionTypeSchema.optional(),
    conditionConfig: z.record(z.unknown()).default({}),
    parentStepId: z.string().nullable().optional()
});

// Workflow schema
export const WorkflowSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    triggerType: TriggerTypeSchema,
    triggerConfig: TriggerConfigSchema.default({}),
    entityType: EntityTypeSchema,
    isActive: z.boolean().default(false),
    priority: z.number().default(0),
    steps: z.array(WorkflowStepSchema).default([])
});

// Update workflow schema
export const UpdateWorkflowSchema = WorkflowSchema.partial();

// Workflow execution filter schema
export const ExecutionFilterSchema = z.object({
    workflowId: z.string().optional(),
    status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED']).optional(),
    entityType: EntityTypeSchema.optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20)
});

// SLA Policy schema
export const SLAPolicySchema = z.object({
    name: z.string().min(1).max(255),
    entityType: EntityTypeSchema,
    statusTrigger: z.string(),
    targetMinutes: z.number().min(1),
    escalationWorkflowId: z.string().optional(),
    isActive: z.boolean().default(true)
});

// Lead scoring config schema
export const LeadScoringConfigSchema = z.object({
    enabled: z.boolean(),
    rules: z.array(z.object({
        field: z.string(),
        operator: z.string(),
        value: z.unknown(),
        points: z.number()
    })),
    autoUpdatePriority: z.boolean(),
    thresholds: z.object({
        HIGH: z.number(),
        MEDIUM: z.number(),
        LOW: z.number()
    })
});

// Validation helpers
export function validateWorkflow(data: unknown) {
    return WorkflowSchema.safeParse(data);
}

export function validateWorkflowStep(data: unknown) {
    return WorkflowStepSchema.safeParse(data);
}

export function validateSLAPolicy(data: unknown) {
    return SLAPolicySchema.safeParse(data);
}

export function validateLeadScoringConfig(data: unknown) {
    return LeadScoringConfigSchema.safeParse(data);
}

export type WorkflowInput = z.infer<typeof WorkflowSchema>;
export type WorkflowStepInput = z.infer<typeof WorkflowStepSchema>;
export type SLAPolicyInput = z.infer<typeof SLAPolicySchema>;
export type LeadScoringConfigInput = z.infer<typeof LeadScoringConfigSchema>;
