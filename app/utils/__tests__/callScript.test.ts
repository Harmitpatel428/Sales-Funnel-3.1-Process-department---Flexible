/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Lead } from '../../types/shared';
import {
  isTemplateString,
  getGlobalTemplate,
  saveGlobalTemplate,
  getResolvedScriptForLead,
} from '../callScript';

const makeLead = (id: string, company?: string, client?: string): Lead => ({
  id,
  kva: `KVA-${id}`,
  connectionDate: '01-01-2020',
  consumerNumber: '',
  company: company || `Company ${id}`,
  clientName: client || `Client ${id}`,
  mobileNumbers: [],
  mobileNumber: '',
  unitType: 'New',
  status: 'New',
  lastActivityDate: '',
  followUpDate: '',
  isDone: false,
  isDeleted: false,
  isUpdated: false,
});

describe('callScript utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('detects template strings correctly', () => {
    expect(isTemplateString('Hello ${company_name}')).toBe(true);
    expect(isTemplateString('Hello {{company}}')).toBe(true);
    expect(isTemplateString('No placeholders here')).toBe(false);
    expect(isTemplateString('Harshad Patel')).toBe(false);
  });

  it('saves and loads global scripts', () => {
    saveGlobalTemplate('Custom Global Script');
    expect(getGlobalTemplate()).toBe('Custom Global Script');
    expect(localStorage.getItem('global_call_script_template')).toBe('Custom Global Script');
  });

  it('getResolvedScriptForLead prefers global saved template when present', () => {
    const leadA = makeLead('A');
    const leadB = makeLead('B');
    saveGlobalTemplate('Global ${company_name}');

    const resolvedA = getResolvedScriptForLead(leadA);
    const resolvedB = getResolvedScriptForLead(leadB);

    expect(resolvedA).toContain(leadA.company);
    // global template should apply for B
    expect(resolvedB).toContain(leadB.company);
  });

  it('does not apply a global literal script across leads', () => {
    const leadA = makeLead('A');
    const leadB = makeLead('B');
    localStorage.setItem('global_call_script_template', 'Harshad Patel');

    const resolvedA = getResolvedScriptForLead(leadA);
    const resolvedB = getResolvedScriptForLead(leadB);

    // Neither should be the literal global value since it's not a template
    expect(resolvedA).not.toBe('Harshad Patel');
    expect(resolvedB).not.toBe('Harshad Patel');
    // They should be default-built scripts containing company names
    expect(resolvedA).toContain(leadA.company);
    expect(resolvedB).toContain(leadB.company);
  });
});
