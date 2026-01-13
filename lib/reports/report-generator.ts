/**
 * Report Generator
 * Generates reports in various formats (Excel, CSV, PDF)
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import type { ReportConfig, ReportField, ReportFilter } from '@/lib/validation/report-schemas';

interface ReportOutput {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    recordCount: number;
}

/**
 * Generate a report based on configuration
 */
export async function generateReport(
    config: ReportConfig,
    additionalFilters: Record<string, any> = {},
    format: 'EXCEL' | 'CSV' | 'PDF' = 'EXCEL',
    tenantId: string
): Promise<ReportOutput> {
    // Fetch data based on data source
    const data = await fetchReportData(config, tenantId, additionalFilters);

    // Apply client-side processing (grouping, aggregation)
    const processedData = processReportData(data, config);

    // Generate output in requested format
    switch (format) {
        case 'EXCEL':
            return generateExcel(processedData, config);
        case 'CSV':
            return generateCSV(processedData, config);
        case 'PDF':
            return generatePDF(processedData, config);
        default:
            return generateExcel(processedData, config);
    }
}

/**
 * Fetch data from database based on report configuration
 */
async function fetchReportData(
    config: ReportConfig,
    tenantId: string,
    additionalFilters: Record<string, any>
): Promise<any[]> {
    const whereClause: any = { tenantId };

    // Apply filters
    for (const filter of config.filters) {
        const value = applyFilterOperator(filter);
        if (value !== undefined) {
            whereClause[filter.fieldKey] = value;
        }
    }

    // Apply additional filters
    Object.assign(whereClause, additionalFilters);

    // Select only needed fields
    const selectClause: any = {};
    for (const field of config.fields) {
        selectClause[field.fieldKey] = true;
    }

    // Determine sort order
    const orderBy: any = {};
    if (config.sorts && config.sorts.length > 0) {
        orderBy[config.sorts[0].fieldKey] = config.sorts[0].direction;
    } else {
        orderBy.createdAt = 'desc';
    }

    // Fetch data based on data source
    let data: any[] = [];

    switch (config.dataSource) {
        case 'leads':
            data = await prisma.lead.findMany({
                where: { ...whereClause, isDeleted: false },
                select: selectClause,
                orderBy,
                take: config.limit
            });
            break;

        case 'cases':
            data = await prisma.case.findMany({
                where: whereClause,
                select: selectClause,
                orderBy,
                take: config.limit
            });
            break;

        case 'users':
            data = await prisma.user.findMany({
                where: whereClause,
                select: {
                    ...selectClause,
                    password: false // Never include password
                },
                orderBy,
                take: config.limit
            });
            break;
    }

    return data;
}

/**
 * Apply filter operator to create Prisma where clause value
 */
function applyFilterOperator(filter: ReportFilter): any {
    const { operator, value, value2 } = filter;

    switch (operator) {
        case 'equals':
            return value;
        case 'notEquals':
            return { not: value };
        case 'contains':
            return { contains: value, mode: 'insensitive' };
        case 'notContains':
            return { not: { contains: value } };
        case 'startsWith':
            return { startsWith: value };
        case 'endsWith':
            return { endsWith: value };
        case 'greaterThan':
            return { gt: value };
        case 'lessThan':
            return { lt: value };
        case 'greaterThanOrEqual':
            return { gte: value };
        case 'lessThanOrEqual':
            return { lte: value };
        case 'between':
            return { gte: value, lte: value2 };
        case 'in':
            return { in: value };
        case 'notIn':
            return { notIn: value };
        case 'isNull':
            return null;
        case 'isNotNull':
            return { not: null };
        default:
            return value;
    }
}

/**
 * Process report data (grouping, aggregation)
 */
function processReportData(data: any[], config: ReportConfig): any[] {
    if (!config.groupBy) {
        return data;
    }

    // Group data by specified field
    const groups: Record<string, any[]> = {};
    for (const row of data) {
        const key = String(row[config.groupBy.fieldKey] || 'Unknown');
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(row);
    }

    // Apply aggregations
    const result: any[] = [];
    for (const [groupKey, groupRows] of Object.entries(groups)) {
        const aggregatedRow: any = { [config.groupBy.fieldKey]: groupKey };

        for (const field of config.fields) {
            if (field.aggregation) {
                aggregatedRow[field.fieldKey] = calculateAggregation(
                    groupRows.map(r => r[field.fieldKey]),
                    field.aggregation
                );
            }
        }

        aggregatedRow._count = groupRows.length;
        result.push(aggregatedRow);
    }

    return result;
}

/**
 * Calculate aggregation value
 */
function calculateAggregation(values: any[], aggregation: string): number {
    const numbers = values
        .map(v => parseFloat(String(v).replace(/[^0-9.-]/g, '')))
        .filter(n => !isNaN(n));

    if (numbers.length === 0) return 0;

    switch (aggregation) {
        case 'sum':
            return numbers.reduce((a, b) => a + b, 0);
        case 'average':
            return numbers.reduce((a, b) => a + b, 0) / numbers.length;
        case 'min':
            return Math.min(...numbers);
        case 'max':
            return Math.max(...numbers);
        case 'count':
            return values.length;
        case 'countDistinct':
            return new Set(values).size;
        default:
            return 0;
    }
}

/**
 * Generate Excel file
 */
function generateExcel(data: any[], config: ReportConfig): ReportOutput {
    const wb = XLSX.utils.book_new();

    // Create header row
    const headers = config.fields.map(f => f.label);

    // Create data rows
    const rows = data.map(row =>
        config.fields.map(f => formatValue(row[f.fieldKey], f))
    );

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths
    const colWidths = config.fields.map(f => ({ wch: Math.max(f.label.length, 15) }));
    ws['!cols'] = colWidths;

    // Style header row (Note: basic XLSX doesn't support styling without pro version)

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Report');

    // Add summary sheet if totals enabled
    if (config.includeTotals) {
        const summaryData = [
            ['Report Summary'],
            ['Generated At', new Date().toISOString()],
            ['Total Records', data.length],
            ['Data Source', config.dataSource]
        ];
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    }

    // Generate buffer
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const fileName = `report_${Date.now()}.xlsx`;

    return {
        buffer,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        recordCount: data.length
    };
}

/**
 * Generate CSV file
 */
function generateCSV(data: any[], config: ReportConfig): ReportOutput {
    const headers = config.fields.map(f => `"${f.label}"`).join(',');

    const rows = data.map(row =>
        config.fields.map(f => {
            const value = formatValue(row[f.fieldKey], f);
            // Escape quotes and wrap in quotes
            return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const buffer = Buffer.from(csv, 'utf-8');
    const fileName = `report_${Date.now()}.csv`;

    return {
        buffer,
        fileName,
        mimeType: 'text/csv',
        recordCount: data.length
    };
}

/**
 * Generate PDF file (simplified - returns HTML for now)
 * In production, use a proper PDF library like puppeteer or pdfkit
 */
function generatePDF(data: any[], config: ReportConfig): ReportOutput {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4f46e5; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .summary { margin-top: 20px; color: #666; }
  </style>
</head>
<body>
  <h1>Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <table>
    <thead>
      <tr>
        ${config.fields.map(f => `<th>${f.label}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr>
          ${config.fields.map(f => `<td>${formatValue(row[f.fieldKey], f)}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="summary">
    <p>Total Records: ${data.length}</p>
  </div>
</body>
</html>
  `;

    const buffer = Buffer.from(html, 'utf-8');
    const fileName = `report_${Date.now()}.html`; // Would be .pdf in production

    return {
        buffer,
        fileName,
        mimeType: 'text/html', // Would be application/pdf in production
        recordCount: data.length
    };
}

/**
 * Format value based on field configuration
 */
function formatValue(value: any, field: ReportField): string {
    if (value === null || value === undefined) {
        return '';
    }

    switch (field.format) {
        case 'currency':
            const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
            return isNaN(num) ? String(value) : `₹${num.toLocaleString('en-IN')}`;
        case 'percentage':
            return `${value}%`;
        case 'date':
            try {
                return new Date(value).toLocaleDateString('en-IN');
            } catch {
                return String(value);
            }
        default:
            if (field.type === 'boolean') {
                return value ? 'Yes' : 'No';
            }
            if (field.type === 'date') {
                try {
                    return new Date(value).toLocaleDateString('en-IN');
                } catch {
                    return String(value);
                }
            }
            return String(value);
    }
}

/**
 * Execute report and return data without generating file
 */
export async function executeReport(
    config: ReportConfig,
    tenantId: string,
    additionalFilters: Record<string, any> = {}
): Promise<{ data: any[]; totalCount: number }> {
    const data = await fetchReportData(config, tenantId, additionalFilters);
    const processedData = processReportData(data, config);

    return {
        data: processedData,
        totalCount: data.length
    };
}
