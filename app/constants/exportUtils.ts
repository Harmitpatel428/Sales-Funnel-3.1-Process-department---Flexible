import { Lead } from '../types/shared';
import { calculateSimilarity, normalizeHeader } from '../utils/stringUtils';
import * as XLSX from 'xlsx';

/**
 * Export utility functions for validating and managing export headers
 */

// Type definitions for import functionality
export interface ImportStats {
  totalRows: number;
  emptyRowsSkipped: number;
  headerRowIndex: number;
  dataRowsProcessed: number;
  validLeadsImported: number;
  invalidLeadsSkipped: number;
  columnsMapped: number;
  columnsUnmapped: number;
  fuzzyMatchesUsed: number;
  dataTypeConversions: number;
  errors: string[];
  warnings: string[];
}

export interface HeaderDetectionResult {
  headerRowIndex: number;
  headers: string[];
  dataStartIndex: number;
  confidence: number;
  skippedRows: number[];
}

export interface ColumnMapping {
  excelHeader: string;
  systemField: string;
  matchType: 'exact' | 'fuzzy' | 'manual' | 'unmapped';
  confidence: number;
  sampleValue: any;
}

export interface ExportHeaderValidation {
  valid: boolean;
  warnings: string[];
  suggestions: string[];
}

export interface MobileNumberHeaders {
  hasMultiple: boolean;
  hasThree: boolean;
  headers: string[];
}

/**
 * Validates that export headers will map correctly on import
 * @param headers Array of header strings
 * @returns Validation result with warnings and suggestions
 */
export function validateExportHeaders(headers: string[]): ExportHeaderValidation {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check for critical fields
  const criticalFields = ['KVA', 'Client Name', 'Mobile Number', 'Status'];
  const missingCritical = criticalFields.filter(field =>
    !headers.some(header => header.toLowerCase().includes(field.toLowerCase()))
  );

  if (missingCritical.length > 0) {
    warnings.push(`Missing critical fields: ${missingCritical.join(', ')}`);
    suggestions.push(`Add headers: ${missingCritical.join(', ')}`);
  }

  // Check for common header variations
  const commonVariations = {
    'mobile': ['Mobile Number', 'Phone', 'Contact Number'],
    'client': ['Client Name', 'Customer Name', 'Lead Name'],
    'status': ['Status', 'Lead Status', 'Current Status'],
    'date': ['Connection Date', 'Last Activity Date', 'Follow Up Date']
  };

  Object.entries(commonVariations).forEach(([category, variations]) => {
    const hasCategoryHeader = headers.some(header =>
      variations.some(variation => header.toLowerCase().includes(variation.toLowerCase()))
    );

    if (!hasCategoryHeader) {
      suggestions.push(`Consider adding ${category} field: ${variations.join(' or ')}`);
    }
  });

  // Check for potential mapping issues
  const problematicHeaders = headers.filter(header => {
    const lower = header.toLowerCase();
    return lower.includes(' ') && lower.length > 20; // Long headers with spaces might cause issues
  });

  if (problematicHeaders.length > 0) {
    warnings.push(`Long headers detected: ${problematicHeaders.join(', ')}`);
    suggestions.push('Consider shortening header names for better compatibility');
  }

  return {
    valid: warnings.length === 0,
    warnings,
    suggestions
  };
}

/**
 * Returns a list of headers that should always be included in exports
 * @returns Array of required header strings
 */
export function getRequiredExportHeaders(): string[] {
  return [
    'KVA',
    'Client Name',
    'Mobile Number',
    'Status',
    'Last Activity Date',
    'Follow Up Date'
  ];
}

/**
 * Checks if leads have multiple mobile numbers and returns appropriate headers
 * @param leads Array of leads to check
 * @returns Mobile number header information
 */
export function getMobileNumberHeaders(leads: Lead[]): MobileNumberHeaders {
  const hasMultiple = leads.some(lead =>
    lead.mobileNumbers && lead.mobileNumbers.length > 1
  );
  const hasThree = leads.some(lead =>
    lead.mobileNumbers && lead.mobileNumbers.length > 2
  );

  const headers: string[] = [];
  if (hasMultiple) {
    headers.push('Mobile Number 2', 'Contact Name 2');
  }
  if (hasThree) {
    headers.push('Mobile Number 3', 'Contact Name 3');
  }

  return {
    hasMultiple,
    hasThree,
    headers
  };
}

/**
 * Validates that all required headers are present in the export
 * @param headers Current export headers
 * @param leads Leads being exported
 * @returns Validation result
 */
export function validateRequiredHeaders(headers: string[], leads: Lead[]): ExportHeaderValidation {
  const requiredHeaders = getRequiredExportHeaders();
  const mobileHeaders = getMobileNumberHeaders(leads);
  const allRequiredHeaders = [...requiredHeaders, ...mobileHeaders.headers];

  const missingHeaders = allRequiredHeaders.filter(required =>
    !headers.some(header => header.toLowerCase().includes(required.toLowerCase()))
  );

  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (missingHeaders.length > 0) {
    warnings.push(`Missing required headers: ${missingHeaders.join(', ')}`);
    suggestions.push(`Add missing headers: ${missingHeaders.join(', ')}`);
  }

  return {
    valid: missingHeaders.length === 0,
    warnings,
    suggestions
  };
}

/**
 * Provides suggestions for improving export headers
 * @param headers Current headers
 * @param leads Leads being exported
 * @returns Array of suggestion strings
 */
export function getExportSuggestions(headers: string[], leads: Lead[]): string[] {
  const suggestions: string[] = [];

  // Check for mobile number completeness
  const mobileHeaders = getMobileNumberHeaders(leads);
  if (mobileHeaders.hasMultiple && !headers.some(h => h.toLowerCase().includes('mobile number 2'))) {
    suggestions.push('Add Mobile Number 2 and Contact Name 2 columns for complete mobile number export');
  }

  if (mobileHeaders.hasThree && !headers.some(h => h.toLowerCase().includes('mobile number 3'))) {
    suggestions.push('Add Mobile Number 3 and Contact Name 3 columns for complete mobile number export');
  }

  // Check for date field completeness
  const dateFields = ['Connection Date', 'Last Activity Date', 'Follow Up Date'];
  const missingDateFields = dateFields.filter(dateField =>
    !headers.some(header => header.toLowerCase().includes(dateField.toLowerCase()))
  );

  if (missingDateFields.length > 0) {
    suggestions.push(`Consider adding date fields: ${missingDateFields.join(', ')}`);
  }

  // Check for status field variations
  if (!headers.some(h => h.toLowerCase().includes('status'))) {
    suggestions.push('Add Status field to track lead progress');
  }

  return suggestions;
}

// Header Detection Functions

/**
 * Check if a row is empty (all cells are empty/null/undefined)
 * @param row Array of cell values
 * @returns True if row is empty
 */
export function isEmptyRow(row: any[]): boolean {
  if (!row || row.length === 0) return true;

  return row.every(cell =>
    cell === null ||
    cell === undefined ||
    cell === '' ||
    (typeof cell === 'string' && cell.trim() === '')
  );
}

/**
 * Check if a row looks like headers based on patterns
 * @param row Array of cell values
 * @returns True if row appears to be headers
 */
export function isLikelyHeaderRow(row: any[]): boolean {
  if (!row || row.length < 3) return false;

  // Check for common header keywords
  const headerKeywords = [
    'name', 'number', 'date', 'status', 'id', 'type', 'mobile', 'phone',
    'client', 'customer', 'lead', 'kva', 'address', 'email', 'contact',
    'amount', 'price', 'value', 'description', 'remarks', 'notes'
  ];

  const textCells = row.filter(cell =>
    typeof cell === 'string' && cell.trim().length > 0
  );

  if (textCells.length < 3) return false;

  // Check if cells contain header-like keywords
  const keywordMatches = textCells.filter(cell =>
    headerKeywords.some(keyword =>
      normalizeHeader(cell).includes(keyword)
    )
  ).length;

  // Check for text vs number ratio
  const numberCells = row.filter(cell =>
    typeof cell === 'number' ||
    (typeof cell === 'string' && !isNaN(Number(cell)) && cell.trim() !== '')
  );

  const textRatio = textCells.length / row.length;
  const keywordRatio = keywordMatches / textCells.length;

  // Headers should be mostly text and contain keywords
  return textRatio > 0.6 && keywordRatio > 0.3;
}

/**
 * Calculate how "header-like" a row is
 * @param row Array of cell values
 * @returns Score from 0-10 (higher = more likely to be headers)
 */
export function getHeaderPatternScore(row: any[]): number {
  if (!row || row.length === 0) return 0;

  let score = 0;

  // Check for empty cells (headers shouldn't have many empty cells)
  const emptyCells = row.filter(cell =>
    cell === null || cell === undefined || cell === ''
  ).length;
  const emptyRatio = emptyCells / row.length;
  score += (1 - emptyRatio) * 3; // Up to 3 points

  // Check for text content
  const textCells = row.filter(cell =>
    typeof cell === 'string' && cell.trim().length > 0
  );
  const textRatio = textCells.length / row.length;
  score += textRatio * 2; // Up to 2 points

  // Check for header keywords
  const headerKeywords = [
    'name', 'number', 'date', 'status', 'id', 'type', 'mobile', 'phone',
    'client', 'customer', 'lead', 'kva', 'address', 'email', 'contact'
  ];

  const keywordMatches = textCells.filter(cell =>
    headerKeywords.some(keyword =>
      normalizeHeader(cell).includes(keyword)
    )
  ).length;

  if (textCells.length > 0) {
    score += (keywordMatches / textCells.length) * 3; // Up to 3 points
  }

  // Check for reasonable length (not too long, not too short)
  const avgLength = textCells.reduce((sum, cell) => sum + cell.length, 0) / textCells.length;
  if (avgLength > 5 && avgLength < 30) {
    score += 1; // 1 point for reasonable length
  }

  // Check for no very long cells (suggests data, not headers)
  const hasVeryLongCell = textCells.some(cell => cell.length > 100);
  if (!hasVeryLongCell) {
    score += 1; // 1 point for no very long cells
  }

  return Math.min(10, Math.max(0, score));
}

/**
 * Detect the header row index in Excel data
 * @param rows Array of rows from Excel file
 * @returns Index of the most likely header row
 */
export function detectHeaderRowIndex(rows: any[][]): number {
  if (!rows || rows.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = 0;

  // Check first 10 rows for header patterns
  const maxRowsToCheck = Math.min(10, rows.length);

  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) continue;

    const score = getHeaderPatternScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Detect header row with detailed information
 * @param rows Array of rows from Excel file
 * @returns Detailed header detection result
 */
export function detectHeaderRow(rows: any[][]): HeaderDetectionResult {
  if (!rows || rows.length === 0) {
    return {
      headerRowIndex: 0,
      headers: [],
      dataStartIndex: 1,
      confidence: 0,
      skippedRows: []
    };
  }

  const skippedRows: number[] = [];
  let headerRowIndex = 0;
  let bestScore = 0;

  // Find the best header row
  const maxRowsToCheck = Math.min(10, rows.length);

  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];

    if (isEmptyRow(row)) {
      skippedRows.push(i);
      continue;
    }

    const score = getHeaderPatternScore(row);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  const headers = rows[headerRowIndex] || [];
  const dataStartIndex = headerRowIndex + 1;
  const confidence = bestScore / 10; // Convert to 0-1 scale

  return {
    headerRowIndex,
    headers: headers.map(h => String(h || '')),
    dataStartIndex,
    confidence,
    skippedRows
  };
}

// Mapping Validation Functions

/**
 * Validate column mappings
 * @param mappings Record of header to field mappings
 * @param requiredFields Array of required field keys
 * @returns Validation result
 */
export function validateMappings(
  mappings: Record<string, string>,
  requiredFields: string[]
): { valid: boolean; missing: string[] } {
  const mappedFields = Object.values(mappings);
  const missing = requiredFields.filter(field => !mappedFields.includes(field));

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Find duplicate mappings (multiple headers mapping to same field)
 * @param mappings Record of header to field mappings
 * @returns Array of field keys that have multiple mappings
 */
export function findDuplicateMappings(mappings: Record<string, string>): string[] {
  const fieldCounts: Record<string, number> = {};

  Object.values(mappings).forEach(field => {
    fieldCounts[field] = (fieldCounts[field] || 0) + 1;
  });

  return Object.entries(fieldCounts)
    .filter(([_, count]) => count > 1)
    .map(([field, _]) => field);
}

/**
 * Suggest best field mapping for an unmapped header
 * @param header Header string to map
 * @param availableFields Array of available field keys
 * @returns Suggested field key or null
 */
export function suggestMapping(header: string, availableFields: string[]): string | null {
  const normalizedHeader = normalizeHeader(header);

  // Try exact match first
  const exactMatch = availableFields.find(field =>
    normalizeHeader(field) === normalizedHeader
  );
  if (exactMatch) return exactMatch;

  // Try fuzzy matching
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const field of availableFields) {
    const score = calculateSimilarity(normalizedHeader, field);
    if (score > bestScore && score > 0.7) {
      bestScore = score;
      bestMatch = field;
    }
  }

  return bestMatch;
}

// Import Statistics Functions

/**
 * Create empty import statistics object
 * @returns Initialized import statistics
 */
export function createImportStats(): ImportStats {
  return {
    totalRows: 0,
    emptyRowsSkipped: 0,
    headerRowIndex: 0,
    dataRowsProcessed: 0,
    validLeadsImported: 0,
    invalidLeadsSkipped: 0,
    columnsMapped: 0,
    columnsUnmapped: 0,
    fuzzyMatchesUsed: 0,
    dataTypeConversions: 0,
    errors: [],
    warnings: []
  };
}

/**
 * Update import statistics
 * @param stats Current statistics
 * @param event Event type
 * @param data Optional event data
 * @returns Updated statistics
 */
export function updateImportStats(stats: ImportStats, event: string, data?: any): ImportStats {
  const updated = { ...stats };

  switch (event) {
    case 'totalRows':
      updated.totalRows = data || 0;
      break;
    case 'emptyRowsSkipped':
      updated.emptyRowsSkipped = (updated.emptyRowsSkipped || 0) + (data || 1);
      break;
    case 'headerRowIndex':
      updated.headerRowIndex = data || 0;
      break;
    case 'dataRowsProcessed':
      updated.dataRowsProcessed = data || 0;
      break;
    case 'validLeadsImported':
      updated.validLeadsImported = (updated.validLeadsImported || 0) + (data || 1);
      break;
    case 'invalidLeadsSkipped':
      updated.invalidLeadsSkipped = (updated.invalidLeadsSkipped || 0) + (data || 1);
      break;
    case 'columnsMapped':
      updated.columnsMapped = data || 0;
      break;
    case 'columnsUnmapped':
      updated.columnsUnmapped = data || 0;
      break;
    case 'fuzzyMatchesUsed':
      updated.fuzzyMatchesUsed = (updated.fuzzyMatchesUsed || 0) + (data || 1);
      break;
    case 'dataTypeConversions':
      updated.dataTypeConversions = (updated.dataTypeConversions || 0) + (data || 1);
      break;
    case 'error':
      updated.errors.push(data || 'Unknown error');
      break;
    case 'warning':
      updated.warnings.push(data || 'Unknown warning');
      break;
  }

  return updated;
}

/**
 * Format import statistics for display
 * @param stats Import statistics
 * @returns Formatted string
 */
export function formatImportStats(stats: ImportStats): string {
  const lines = [
    `Import Summary:`,
    `- Total rows in file: ${stats.totalRows}`,
    `- Empty rows skipped: ${stats.emptyRowsSkipped}`,
    `- Header row index: ${stats.headerRowIndex}`,
    `- Data rows processed: ${stats.dataRowsProcessed}`,
    `- Valid leads imported: ${stats.validLeadsImported}`,
    `- Invalid leads skipped: ${stats.invalidLeadsSkipped}`,
    `- Columns mapped: ${stats.columnsMapped}`,
    `- Columns unmapped: ${stats.columnsUnmapped}`,
    `- Fuzzy matches used: ${stats.fuzzyMatchesUsed}`,
    `- Data type conversions: ${stats.dataTypeConversions}`
  ];

  if (stats.errors.length > 0) {
    lines.push(`- Errors: ${stats.errors.length}`);
    stats.errors.forEach(error => lines.push(`  • ${error}`));
  }

  if (stats.warnings.length > 0) {
    lines.push(`- Warnings: ${stats.warnings.length}`);
    stats.warnings.forEach(warning => lines.push(`  • ${warning}`));
  }

  return lines.join('\n');
}

// =============================================================================
// EXPORT HELPERS - Excel, CSV, PDF generation with formatting
// =============================================================================

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  format?: 'text' | 'number' | 'currency' | 'percentage' | 'date';
  align?: 'left' | 'center' | 'right';
}

export interface ExportSheet {
  name: string;
  data: any[];
  columns: ExportColumn[];
}

export interface ExportOptions {
  fileName?: string;
  title?: string;
  includeTimestamp?: boolean;
  currencySymbol?: string;
  dateFormat?: string;
  includeSummary?: boolean;
  summaryData?: Record<string, any>;
}

/**
 * Format a cell value based on column format
 */
function formatCellValue(value: any, format?: ExportColumn['format'], currencySymbol: string = '₹'): any {
  if (value === null || value === undefined) return '';

  switch (format) {
    case 'currency':
      const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? value : `${currencySymbol}${num.toLocaleString('en-IN')}`;
    case 'percentage':
      const pct = parseFloat(String(value));
      return isNaN(pct) ? value : `${pct.toFixed(1)}%`;
    case 'date':
      try {
        const date = new Date(value);
        return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return value;
      }
    case 'number':
      const n = parseFloat(String(value));
      return isNaN(n) ? value : n.toLocaleString('en-IN');
    default:
      return String(value);
  }
}

/**
 * Export data to Excel file with formatting, column widths, and multi-sheet support
 */
export function exportToExcel(
  sheets: ExportSheet[] | { data: any[]; columns: ExportColumn[] },
  options: ExportOptions = {}
): Blob {
  const {
    fileName = 'export',
    title,
    includeTimestamp = true,
    currencySymbol = '₹',
    includeSummary = false,
    summaryData
  } = options;

  const wb = XLSX.utils.book_new();

  // Normalize input to array of sheets
  const sheetArray: ExportSheet[] = Array.isArray(sheets)
    ? sheets
    : [{ name: 'Data', data: sheets.data, columns: sheets.columns }];

  for (const sheet of sheetArray) {
    const { name, data, columns } = sheet;

    // Create header row
    const headers = columns.map(col => col.header);

    // Create data rows with formatting
    const rows = data.map(row =>
      columns.map(col => formatCellValue(row[col.key], col.format, currencySymbol))
    );

    // Combine headers and data
    const allRows = [headers, ...rows];

    // Add title row if provided
    if (title) {
      allRows.unshift([title]);
      allRows.unshift([]); // Empty row for spacing
    }

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Set column widths
    const colWidths = columns.map(col => ({
      wch: col.width || Math.max(col.header.length, 15)
    }));
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  }

  // Add summary sheet if requested
  if (includeSummary && summaryData) {
    const summaryRows = [
      ['Report Summary'],
      [],
      ['Generated At', new Date().toLocaleString('en-IN')],
      ['Total Records', sheetArray.reduce((sum, s) => sum + s.data.length, 0)],
      [],
      ...Object.entries(summaryData).map(([key, value]) => [key, value])
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
  }

  // Generate file
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Export data to CSV file with proper formatting and escaping
 */
export function exportToCSV(
  data: any[],
  columns: ExportColumn[],
  options: ExportOptions = {}
): Blob {
  const { currencySymbol = '₹' } = options;

  // Create header row
  const headerRow = columns.map(col => `"${col.header.replace(/"/g, '""')}"`).join(',');

  // Create data rows
  const dataRows = data.map(row =>
    columns.map(col => {
      const value = formatCellValue(row[col.key], col.format, currencySymbol);
      // Escape quotes and wrap in quotes
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csv = [headerRow, ...dataRows].join('\n');
  return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel UTF-8
}

/**
 * Export data to PDF-ready HTML (to be used with a PDF renderer)
 */
export function exportToPDF(
  data: any[],
  columns: ExportColumn[],
  options: ExportOptions = {}
): string {
  const {
    title = 'Report',
    includeTimestamp = true,
    currencySymbol = '₹',
    includeSummary = false,
    summaryData
  } = options;

  const timestamp = includeTimestamp ? new Date().toLocaleString('en-IN') : '';

  // Determine column alignments
  const getAlignment = (col: ExportColumn): string => {
    if (col.align) return col.align;
    if (['currency', 'percentage', 'number'].includes(col.format || '')) return 'right';
    return 'left';
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; color: #333; padding: 20px; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #4f46e5; padding-bottom: 15px; }
    .header h1 { color: #4f46e5; font-size: 18pt; margin-bottom: 5px; }
    .header .timestamp { color: #666; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th { background-color: #4f46e5; color: white; padding: 10px 8px; font-weight: 600; text-align: left; border: 1px solid #4f46e5; }
    td { padding: 8px; border: 1px solid #ddd; }
    tr:nth-child(even) { background-color: #f8f9fa; }
    tr:hover { background-color: #e8eef6; }
    .align-right { text-align: right; }
    .align-center { text-align: center; }
    .summary { margin-top: 30px; padding: 15px; background-color: #f0f4ff; border-radius: 8px; }
    .summary h3 { color: #4f46e5; margin-bottom: 10px; }
    .summary-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e0e7ff; }
    .summary-item:last-child { border-bottom: none; }
    .footer { margin-top: 30px; text-align: center; color: #888; font-size: 8pt; }
    @media print {
      body { padding: 0; }
      .header { page-break-after: avoid; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    ${includeTimestamp ? `<div class="timestamp">Generated: ${timestamp}</div>` : ''}
  </div>
  
  <table>
    <thead>
      <tr>
        ${columns.map(col => `<th class="align-${getAlignment(col)}">${col.header}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr>
          ${columns.map(col => {
    const value = formatCellValue(row[col.key], col.format, currencySymbol);
    const align = getAlignment(col);
    return `<td class="align-${align}">${value}</td>`;
  }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  ${includeSummary && summaryData ? `
    <div class="summary">
      <h3>Summary</h3>
      ${Object.entries(summaryData).map(([key, value]) => `
        <div class="summary-item">
          <span>${key}</span>
          <strong>${value}</strong>
        </div>
      `).join('')}
    </div>
  ` : ''}
  
  <div class="footer">
    Total Records: ${data.length} | Generated by Sales Funnel CRM
  </div>
</body>
</html>
  `.trim();

  return html;
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export leads to Excel with proper formatting
 */
export function exportLeadsToExcel(leads: Lead[], options: ExportOptions = {}): void {
  const columns: ExportColumn[] = [
    { key: 'clientName', header: 'Client Name', width: 25 },
    { key: 'company', header: 'Company', width: 20 },
    { key: 'mobileNumber', header: 'Mobile Number', width: 15 },
    { key: 'email', header: 'Email', width: 25 },
    { key: 'source', header: 'Source', width: 15 },
    { key: 'status', header: 'Status', width: 15 },
    { key: 'kva', header: 'KVA', width: 10 },
    { key: 'budget', header: 'Budget', width: 15, format: 'currency' },
    { key: 'companyLocation', header: 'Location', width: 20 },
    { key: 'createdAt', header: 'Created At', width: 15, format: 'date' },
    { key: 'followUpDate', header: 'Follow-up Date', width: 15, format: 'date' },
    { key: 'remarks', header: 'Remarks', width: 30 }
  ];

  const blob = exportToExcel({ data: leads, columns }, {
    ...options,
    title: options.title || 'Lead Export',
    includeSummary: true,
    summaryData: {
      'Total Leads': leads.length,
      'Closed Deals': leads.filter(l => l.status === 'Deal Close').length,
      'Active Leads': leads.filter(l => !['Deal Close', 'CNR'].includes(l.status)).length
    }
  });

  const fileName = options.fileName || `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`;
  downloadBlob(blob, fileName);
}

/**
 * Export leads to CSV
 */
export function exportLeadsToCSV(leads: Lead[], options: ExportOptions = {}): void {
  const columns: ExportColumn[] = [
    { key: 'clientName', header: 'Client Name' },
    { key: 'company', header: 'Company' },
    { key: 'mobileNumber', header: 'Mobile Number' },
    { key: 'email', header: 'Email' },
    { key: 'source', header: 'Source' },
    { key: 'status', header: 'Status' },
    { key: 'kva', header: 'KVA' },
    { key: 'budget', header: 'Budget', format: 'currency' },
    { key: 'companyLocation', header: 'Location' },
    { key: 'createdAt', header: 'Created At', format: 'date' },
    { key: 'followUpDate', header: 'Follow-up Date', format: 'date' }
  ];

  const blob = exportToCSV(leads, columns, options);
  const fileName = options.fileName || `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadBlob(blob, fileName);
}

/**
 * Export data to PDF and trigger print/download
 */
export function exportDataToPDF(
  data: any[],
  columns: ExportColumn[],
  options: ExportOptions = {}
): void {
  const html = exportToPDF(data, columns, options);

  // Open in new window for printing/saving as PDF
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  }
}