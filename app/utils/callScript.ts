import type { Lead } from '../types/shared';

export const PER_LEAD_KEY_PREFIX = 'customCallScript:';
export const GLOBAL_KEY = 'global_call_script_template';

export const perLeadKey = (leadId: string) => `${PER_LEAD_KEY_PREFIX}${leadId}`;

export const isTemplateString = (s?: string | null) => {
  if (!s) return false;
  return /\$\{\s*(?:company_name|company|client_name|client)\s*\}|\{\{\s*(?:company_name|company|client_name|client)\s*\}\}|\{\s*(?:company_name|company|client_name|client)\s*\}/i.test(s);
};

export const applyTemplatePlaceholders = (template: string, lead: Lead) => {
  const company = (lead as any)?.company_name || lead.company || '';
  const client = (lead as any)?.client_name || lead.clientName || '';

  return template
    .replace(/\$\{\s*(?:company_name|company)\s*\}/gi, company)
    .replace(/\$\{\s*(?:client_name|client)\s*\}/gi, client)
    .replace(/\{\{\s*(?:company_name|company)\s*\}\}/gi, company)
    .replace(/\{\{\s*(?:client_name|client)\s*\}\}/gi, client)
    .replace(/\{\s*(?:company_name|company)\s*\}/gi, company)
    .replace(/\{\s*(?:client_name|client)\s*\}/gi, client);
};

export const buildGujaratiScript = (lead: Lead) => {
  const companyName = (lead as any)?.company_name || lead.company || 'તમારી કંપની';
  const clientName = (lead as any)?.client_name || lead.clientName || 'સર';

  const template = `નમસ્તે સર\n${companyName} માં થી ${clientName} વાત કરો છો\n\nV4U Biz Solutions, અમદાવાદ થી મુકેશ પટેલ વાત કરું છું. અમારી કંપની ગુજરાત સરકાર દ્વારા અપાતી સબસીડી મેળવવામાં સહાય કરે છે...સર તમારી કંપનીની સબસીડી નું કામ અપાઈ ગયું કે હજી બાકી છે?\n\nસર આપણું એકમ કયા પ્રકારનું છે મેન્યુફેક્ચરિંગ સર્વિસ કે પછી ટ્રેડિંગ યુનિટ છે?\n\nમેન્યુફેક્ચરિંગ યુનિટને કેપિટલ સબસીડી , વ્યાજ સબસીડી , SGST સબસીડી અને પાવર પર મળતીસબસીડી મળવાપાત્ર છે.\n\nસાહેબ આપણી ટમ લોન થઈ ગઈ કે હજુ બાકી છે?\n\nધાન્યવાદ સાહેબ તમારો નંબર મારા સિનિયર ને આપું છું એ તમને સબસીડી વિશે સારી રીતે સમજાવશે ક્યારે કોલ કરવાનું કહूँ સાહેબ?`;

  return template;
};

// Global template storage helpers
export const getGlobalTemplate = (): string | null => {
  try {
    return localStorage.getItem(GLOBAL_KEY);
  } catch (err) {
    console.error('Failed to read global call script template', err);
    return null;
  }
};

export const saveGlobalTemplate = (template: string) => {
  try {
    localStorage.setItem(GLOBAL_KEY, template);
  } catch (err) {
    console.error('Failed to save global call script template', err);
  }
};

// Convert a resolved script into a template by replacing lead-specific values
export const resolveToTemplate = (text: string, lead: Lead) => {
  let result = text;
  const company = (lead as any)?.company_name || (lead as any)?.company || '';
  const client = (lead as any)?.client_name || (lead as any)?.clientName || '';

  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(esc, 'gi'), '{company_name}');
  }

  if (client) {
    const esc = client.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(esc, 'gi'), '{client_name}');
  }

  return result;
};

export const getSavedPerLead = (leadId: string) => {
  return localStorage.getItem(perLeadKey(leadId));
};

export const getResolvedScriptForLead = (lead: Lead) => {
  const rawSaved = getGlobalTemplate();
  const trimmed = rawSaved?.trim();
  if (trimmed) {
    if (isTemplateString(trimmed)) {
      return applyTemplatePlaceholders(trimmed, lead);
    }

    // If it's not an obvious template, attempt to replace known names if present
    const maybeTemplate = resolveToTemplate(trimmed, lead);
    // If resolving didn't change anything (i.e., it's a literal), treat it as non-applicable
    if (maybeTemplate === trimmed) {
      return buildGujaratiScript(lead);
    }

    return applyTemplatePlaceholders(maybeTemplate, lead);
  }

  // Fallback to default build
  return buildGujaratiScript(lead);
};

export default {
  perLeadKey, // legacy helper
  isTemplateString,
  applyTemplatePlaceholders,
  buildGujaratiScript,
  getGlobalTemplate,
  saveGlobalTemplate,
  resolveToTemplate,
  getResolvedScriptForLead,
};
