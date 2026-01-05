import DOMPurify from 'dompurify';
import { debugLogger, DebugCategory } from './debugLogger';

// Safe HTML configuration for rich text fields (if needed in future)
const SAFE_HTML_CONFIG = {
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset'],
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'li', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  ALLOWED_ATTR: ['class']
};

// Text sanitization configuration (strips all HTML)
const TEXT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [] as string[],
  ALLOWED_ATTR: [] as string[]
};

/**
 * Check if we're running on the client side
 */
function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Basic HTML escape for server-side fallback
 * This provides basic XSS protection when DOMPurify isn't available
 */
function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, char => htmlEscapes[char] || char);
}

/**
 * Sanitize text input by stripping all HTML tags and attributes
 * @param input - Raw text input from user
 * @returns Sanitized text string
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // On server side, use basic HTML escaping as fallback
  if (!isClient()) {
    // Strip HTML tags and escape remaining content
    return input.replace(/<[^>]*>/g, '').trim();
  }

  // Use DOMPurify on client side to strip all HTML and sanitize
  const sanitized = DOMPurify.sanitize(input, TEXT_SANITIZE_CONFIG);

  // Trim whitespace
  return sanitized.trim();
}

/**
 * Sanitize HTML input allowing safe HTML tags
 * @param input - HTML input from user
 * @returns Sanitized HTML string
 */
export function sanitizeHTML(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // On server side, strip all HTML as fallback
  if (!isClient()) {
    return input.replace(/<[^>]*>/g, '').trim();
  }

  return DOMPurify.sanitize(input, SAFE_HTML_CONFIG).trim();
}

/**
 * Sanitize a lead object by cleaning all text fields
 * @param lead - Lead object to sanitize
 * @returns Deep cloned and sanitized lead object
 */
export function sanitizeLead(lead: any): any {
  if (!lead || typeof lead !== 'object') {
    return lead;
  }

  // Deep clone the lead object
  let sanitizedLead;
  try {
    sanitizedLead = JSON.parse(JSON.stringify(lead));
  } catch (error) {
    debugLogger.warn(DebugCategory.VALIDATION, 'Failed to deep clone lead for sanitization. Using shallow copy.', {
      leadId: lead.id,
      error: error instanceof Error ? error.message : String(error)
    });
    // Fall back to shallow copy
    sanitizedLead = { ...lead };
  }

  // Sanitize all text fields
  if (sanitizedLead.clientName) {
    sanitizedLead.clientName = sanitizeText(sanitizedLead.clientName);
  }

  if (sanitizedLead.company) {
    sanitizedLead.company = sanitizeText(sanitizedLead.company);
  }

  if (sanitizedLead.notes) {
    sanitizedLead.notes = sanitizeText(sanitizedLead.notes);
  }

  if (sanitizedLead.finalConclusion) {
    sanitizedLead.finalConclusion = sanitizeText(sanitizedLead.finalConclusion);
  }

  if (sanitizedLead.companyLocation) {
    sanitizedLead.companyLocation = sanitizeText(sanitizedLead.companyLocation);
  }

  if (sanitizedLead.gidc) {
    sanitizedLead.gidc = sanitizeText(sanitizedLead.gidc);
  }

  if (sanitizedLead.gstNumber) {
    sanitizedLead.gstNumber = sanitizeText(sanitizedLead.gstNumber);
  }

  if (sanitizedLead.consumerNumber) {
    sanitizedLead.consumerNumber = sanitizeText(sanitizedLead.consumerNumber);
  }

  // Sanitize mobile numbers array
  if (Array.isArray(sanitizedLead.mobileNumbers)) {
    sanitizedLead.mobileNumbers = sanitizedLead.mobileNumbers.map((mobile: any) => ({
      ...mobile,
      name: sanitizeText(mobile.name || ''),
      number: sanitizeText(mobile.number || '')
    }));
  }

  // Sanitize custom fields
  if (sanitizedLead.customFields && typeof sanitizedLead.customFields === 'object') {
    const sanitizedCustomFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(sanitizedLead.customFields)) {
      if (typeof value === 'string') {
        sanitizedCustomFields[sanitizeText(key)] = sanitizeText(value);
      } else {
        sanitizedCustomFields[sanitizeText(key)] = value;
      }
    }
    sanitizedLead.customFields = sanitizedCustomFields;
  }

  return sanitizedLead;
}

/**
 * Sanitize an array of leads
 * @param leads - Array of lead objects
 * @returns Array of sanitized lead objects
 */
export function sanitizeLeadArray(leads: any[]): any[] {
  if (!Array.isArray(leads)) {
    return [];
  }

  return leads.map(lead => sanitizeLead(lead));
}

/**
 * Generic sanitizer for form data objects
 * @param obj - Object to sanitize
 * @returns Sanitized object with all string values cleaned
 */
export function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[sanitizeText(key)] = sanitizeText(value);
    } else if (Array.isArray(value)) {
      sanitized[sanitizeText(key)] = value.map(item =>
        typeof item === 'string' ? sanitizeText(item) : item
      );
    } else if (value && typeof value === 'object') {
      sanitized[sanitizeText(key)] = sanitizeObject(value);
    } else {
      sanitized[sanitizeText(key)] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize column configuration object
 * @param config - Column configuration to sanitize
 * @returns Sanitized column configuration
 */
export function sanitizeColumnConfig(config: any): any {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const sanitized = { ...config };

  // Sanitize string fields
  if (sanitized.id) {
    sanitized.id = sanitizeText(sanitized.id);
  }
  if (sanitized.fieldKey) {
    sanitized.fieldKey = sanitizeText(sanitized.fieldKey);
  }
  if (sanitized.label) {
    sanitized.label = sanitizeText(sanitized.label);
  }
  if (sanitized.description) {
    sanitized.description = sanitizeText(sanitized.description);
  }
  if (sanitized.defaultValue) {
    sanitized.defaultValue = sanitizeText(sanitized.defaultValue);
  }

  // Sanitize options array
  if (Array.isArray(sanitized.options)) {
    sanitized.options = sanitized.options.map((option: any) =>
      typeof option === 'string' ? sanitizeText(option) : option
    );
  }

  return sanitized;
}

/**
 * Sanitize header configuration object
 * @param config - Header configuration to sanitize
 * @returns Sanitized header configuration
 */
export function sanitizeHeaderConfig(config: any): any {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const sanitized = { ...config };

  // Sanitize string fields
  if (sanitized.title) {
    sanitized.title = sanitizeText(sanitized.title);
  }
  if (sanitized.subtitle) {
    sanitized.subtitle = sanitizeText(sanitized.subtitle);
  }

  return sanitized;
}
