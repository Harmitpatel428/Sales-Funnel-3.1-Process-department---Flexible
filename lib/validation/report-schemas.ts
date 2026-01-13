import { z } from 'zod';

// Field types supported in reports
export const FieldTypeSchema = z.enum([
    'string',
    'number',
    'date',
    'boolean',
    'enum'
]);

// Aggregation types for numeric fields
export const AggregationTypeSchema = z.enum([
    'sum',
    'average',
    'min',
    'max',
    'count',
    'countDistinct'
]);

// Filter operators
export const FilterOperatorSchema = z.enum([
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'greaterThan',
    'lessThan',
    'greaterThanOrEqual',
    'lessThanOrEqual',
    'between',
    'in',
    'notIn',
    'isNull',
    'isNotNull'
]);

// Sort direction
export const SortDirectionSchema = z.enum(['asc', 'desc']);

// Chart types
export const ChartTypeSchema = z.enum([
    'TABLE',
    'BAR',
    'LINE',
    'PIE',
    'FUNNEL',
    'AREA',
    'SCATTER',
    'DONUT'
]);

// Group by period for date fields
export const GroupByPeriodSchema = z.enum([
    'day',
    'week',
    'month',
    'quarter',
    'year'
]);

// Report field configuration
export const ReportFieldSchema = z.object({
    fieldKey: z.string().min(1),
    label: z.string().min(1),
    type: FieldTypeSchema,
    aggregation: AggregationTypeSchema.optional(),
    format: z.string().optional(), // e.g., 'currency', 'percentage', 'date'
    visible: z.boolean().default(true),
    width: z.number().optional()
});

// Report filter configuration
export const ReportFilterSchema = z.object({
    fieldKey: z.string().min(1),
    operator: FilterOperatorSchema,
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.any())]).optional(),
    value2: z.union([z.string(), z.number()]).optional() // For 'between' operator
});

// Report sort configuration
export const ReportSortSchema = z.object({
    fieldKey: z.string().min(1),
    direction: SortDirectionSchema
});

// Report group by configuration
export const ReportGroupBySchema = z.object({
    fieldKey: z.string().min(1),
    period: GroupByPeriodSchema.optional() // For date fields
});

// Main report configuration schema
export const ReportConfigSchema = z.object({
    dataSource: z.enum(['leads', 'cases', 'users']),
    fields: z.array(ReportFieldSchema).min(1),
    filters: z.array(ReportFilterSchema).default([]),
    sorts: z.array(ReportSortSchema).default([]),
    groupBy: ReportGroupBySchema.optional(),
    chartType: ChartTypeSchema.default('TABLE'),
    limit: z.number().min(1).max(10000).default(1000),
    includeSubtotals: z.boolean().default(false),
    includeTotals: z.boolean().default(false)
});

// Saved report schema
export const SavedReportSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    config: ReportConfigSchema,
    chartType: ChartTypeSchema.default('TABLE'),
    isPublic: z.boolean().default(false)
});

// Update saved report schema
export const UpdateSavedReportSchema = SavedReportSchema.partial();

// Report template schema
export const ReportTemplateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    config: ReportConfigSchema,
    category: z.enum(['Sales', 'Operations', 'Executive', 'Custom']),
    isPublic: z.boolean().default(false),
    sharedWith: z.array(z.string()).default([]) // User IDs or role IDs
});

// Update template schema
export const UpdateReportTemplateSchema = ReportTemplateSchema.partial();

// Scheduled report schema
export const ScheduledReportSchema = z.object({
    reportId: z.string().min(1),
    schedule: z.string().min(1), // Cron expression
    recipients: z.array(z.string().email()).min(1),
    format: z.enum(['EXCEL', 'PDF', 'CSV']).default('EXCEL'),
    enabled: z.boolean().default(true)
});

// Update scheduled report schema
export const UpdateScheduledReportSchema = ScheduledReportSchema.partial();

// Export types
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type AggregationType = z.infer<typeof AggregationTypeSchema>;
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;
export type SortDirection = z.infer<typeof SortDirectionSchema>;
export type ChartType = z.infer<typeof ChartTypeSchema>;
export type GroupByPeriod = z.infer<typeof GroupByPeriodSchema>;
export type ReportField = z.infer<typeof ReportFieldSchema>;
export type ReportFilter = z.infer<typeof ReportFilterSchema>;
export type ReportSort = z.infer<typeof ReportSortSchema>;
export type ReportGroupBy = z.infer<typeof ReportGroupBySchema>;
export type ReportConfig = z.infer<typeof ReportConfigSchema>;
export type SavedReport = z.infer<typeof SavedReportSchema>;
export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;
export type ScheduledReportInput = z.infer<typeof ScheduledReportSchema>;

// Available fields for each data source
export const LEAD_FIELDS: ReportField[] = [
    { fieldKey: 'clientName', label: 'Client Name', type: 'string', visible: true },
    { fieldKey: 'company', label: 'Company', type: 'string', visible: true },
    { fieldKey: 'email', label: 'Email', type: 'string', visible: true },
    { fieldKey: 'mobileNumber', label: 'Mobile Number', type: 'string', visible: true },
    { fieldKey: 'source', label: 'Source', type: 'string', visible: true },
    { fieldKey: 'status', label: 'Status', type: 'enum', visible: true },
    { fieldKey: 'budget', label: 'Budget', type: 'string', visible: true, format: 'currency' },
    { fieldKey: 'kva', label: 'KVA', type: 'string', visible: true },
    { fieldKey: 'discom', label: 'DISCOM', type: 'string', visible: true },
    { fieldKey: 'gidc', label: 'GIDC', type: 'string', visible: true },
    { fieldKey: 'companyLocation', label: 'Location', type: 'string', visible: true },
    { fieldKey: 'unitType', label: 'Unit Type', type: 'string', visible: true },
    { fieldKey: 'createdAt', label: 'Created At', type: 'date', visible: true },
    { fieldKey: 'followUpDate', label: 'Follow-up Date', type: 'date', visible: true },
    { fieldKey: 'lastActivityDate', label: 'Last Activity', type: 'date', visible: true },
    { fieldKey: 'assignedToId', label: 'Assigned To', type: 'string', visible: true },
    { fieldKey: 'isDone', label: 'Is Done', type: 'boolean', visible: true },
    { fieldKey: 'mandateStatus', label: 'Mandate Status', type: 'string', visible: true },
    { fieldKey: 'documentStatus', label: 'Document Status', type: 'string', visible: true }
];

export const CASE_FIELDS: ReportField[] = [
    { fieldKey: 'caseId', label: 'Case ID', type: 'string', visible: true },
    { fieldKey: 'caseNumber', label: 'Case Number', type: 'string', visible: true },
    { fieldKey: 'leadId', label: 'Lead ID', type: 'string', visible: true },
    { fieldKey: 'clientName', label: 'Client Name', type: 'string', visible: true },
    { fieldKey: 'company', label: 'Company', type: 'string', visible: true },
    { fieldKey: 'schemeType', label: 'Scheme Type', type: 'string', visible: true },
    { fieldKey: 'caseType', label: 'Case Type', type: 'string', visible: true },
    { fieldKey: 'processStatus', label: 'Process Status', type: 'enum', visible: true },
    { fieldKey: 'priority', label: 'Priority', type: 'enum', visible: true },
    { fieldKey: 'assignedProcessUserId', label: 'Assigned To', type: 'string', visible: true },
    { fieldKey: 'mobileNumber', label: 'Mobile Number', type: 'string', visible: true },
    { fieldKey: 'consumerNumber', label: 'Consumer Number', type: 'string', visible: true },
    { fieldKey: 'kva', label: 'KVA', type: 'string', visible: true },
    { fieldKey: 'termLoanAmount', label: 'Term Loan', type: 'string', visible: true, format: 'currency' },
    { fieldKey: 'plantMachineryValue', label: 'Plant Value', type: 'string', visible: true, format: 'currency' },
    { fieldKey: 'createdAt', label: 'Created At', type: 'date', visible: true },
    { fieldKey: 'closedAt', label: 'Closed At', type: 'date', visible: true },
    { fieldKey: 'closureReason', label: 'Closure Reason', type: 'string', visible: true }
];

export const USER_FIELDS: ReportField[] = [
    { fieldKey: 'id', label: 'User ID', type: 'string', visible: true },
    { fieldKey: 'name', label: 'Name', type: 'string', visible: true },
    { fieldKey: 'email', label: 'Email', type: 'string', visible: true },
    { fieldKey: 'role', label: 'Role', type: 'enum', visible: true },
    { fieldKey: 'isActive', label: 'Is Active', type: 'boolean', visible: true },
    { fieldKey: 'createdAt', label: 'Created At', type: 'date', visible: true },
    { fieldKey: 'lastLoginAt', label: 'Last Login', type: 'date', visible: true }
];

export const DATA_SOURCE_FIELDS: Record<string, ReportField[]> = {
    leads: LEAD_FIELDS,
    cases: CASE_FIELDS,
    users: USER_FIELDS
};
