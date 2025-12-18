/// <reference types="vitest" />
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLead,
  isColumnConfig,
  isHeaderConfig,
  isSavedView,
  validateLeadFields,
  validateColumnConfigFields,
  validateHeaderConfigFields,
  validateSavedViewFields,
  validateLeadArray,
  validateColumnConfigArray,
  repairLead,
  repairLeadArray,
  repairColumnConfig,
  checkDataIntegrity
} from '../schemaValidation';
import type { Lead, MobileNumber, Activity } from '../../types/shared';
import type { ColumnConfig } from '../../types/shared';
import type { SavedView } from '../../types/shared';

// Test fixtures
const createValidLead = (): Lead => ({
  id: 'test-id-1',
  kva: '100',
  connectionDate: '01-01-2024',
  consumerNumber: '12345',
  company: 'Test Company',
  clientName: 'John Doe',
  discom: 'UGVCL',
  gidc: 'Test GIDC',
  gstNumber: '22AAAAA0000A1Z5',
  mobileNumbers: [{
    id: 'mobile-1',
    number: '9876543210',
    name: 'Primary',
    isMain: true
  }],
  mobileNumber: '9876543210', // backward compatibility
  companyLocation: 'Test Location',
  unitType: 'New',
  marketingObjective: 'Test Objective',
  budget: '100000',
  timeline: 'Q1 2024',
  status: 'New',
  contactOwner: 'Test Owner',
  lastActivityDate: '01-01-2024',
  followUpDate: '15-01-2024',
  finalConclusion: 'Test Conclusion',
  notes: 'Test Notes',
  isDone: false,
  isDeleted: false,
  isUpdated: false,
  activities: [],
  mandateStatus: 'Pending',
  documentStatus: 'Pending Documents'
});

const createValidColumnConfig = (): ColumnConfig => ({
  id: 'test-column',
  fieldKey: 'testField',
  label: 'Test Field',
  type: 'text',
  required: false,
  sortable: true,
  width: 150,
  visible: true,
  options: undefined,
  defaultValue: '',
  description: 'Test column description'
});

// Local type alias for header config shape used in tests
type HeaderConfig = { kva: string; clientName: string; status: string };

const createValidHeaderConfig = (): HeaderConfig => ({
  kva: 'KVA',
  clientName: 'Client Name',
  status: 'Status'
});

const createValidSavedView = (): SavedView => ({
  id: 'test-view',
  name: 'Test View',
  filters: {
    status: ['New', 'Follow-up'],
    searchTerm: 'test'
  }
});

describe('Schema Validation', () => {
  describe('Type Guards', () => {
    describe('isLead', () => {
      it('should return true for valid lead', () => {
        const validLead = createValidLead();
        expect(isLead(validLead)).toBe(true);
      });

      it('should return false for null/undefined', () => {
        expect(isLead(null)).toBe(false);
        expect(isLead(undefined)).toBe(false);
      });

      it('should return false for missing required fields', () => {
        const invalidLead = { ...createValidLead() };
        delete (invalidLead as any).id;
        expect(isLead(invalidLead)).toBe(false);
      });

      it('should return false for wrong field types', () => {
        const invalidLead = { ...createValidLead(), id: 123 };
        expect(isLead(invalidLead)).toBe(false);
      });

      it('should return false for invalid mobileNumbers array', () => {
        const invalidLead = { ...createValidLead(), mobileNumbers: 'not-an-array' };
        expect(isLead(invalidLead)).toBe(false);
      });

      it('should return false for empty mobileNumbers array', () => {
        const invalidLead = { ...createValidLead(), mobileNumbers: [] };
        expect(isLead(invalidLead)).toBe(false);
      });
    });

    describe('isColumnConfig', () => {
      it('should return true for valid column config', () => {
        const validConfig = createValidColumnConfig();
        expect(isColumnConfig(validConfig)).toBe(true);
      });

      it('should return false for missing required fields', () => {
        const invalidConfig = { ...createValidColumnConfig() };
        delete (invalidConfig as any).id;
        expect(isColumnConfig(invalidConfig)).toBe(false);
      });

      it('should return false for invalid type', () => {
        const invalidConfig = { ...createValidColumnConfig(), type: 'invalid-type' };
        expect(isColumnConfig(invalidConfig)).toBe(false);
      });

      it('should return false for select type without options', () => {
        const invalidConfig = { ...createValidColumnConfig(), type: 'select' };
        expect(isColumnConfig(invalidConfig)).toBe(false);
      });
    });

    describe('isHeaderConfig', () => {
      it('should return true for valid header config', () => {
        const validConfig = createValidHeaderConfig();
        expect(isHeaderConfig(validConfig)).toBe(true);
      });

      it('should return false for non-string values', () => {
        const invalidConfig = { ...createValidHeaderConfig(), kva: 123 };
        expect(isHeaderConfig(invalidConfig)).toBe(false);
      });

      it('should return false for empty string values', () => {
        const invalidConfig = { ...createValidHeaderConfig(), kva: '' };
        expect(isHeaderConfig(invalidConfig)).toBe(false);
      });
    });

    describe('isSavedView', () => {
      it('should return true for valid saved view', () => {
        const validView = createValidSavedView();
        expect(isSavedView(validView)).toBe(true);
      });

      it('should return false for missing required fields', () => {
        const invalidView = { ...createValidSavedView() };
        delete (invalidView as any).id;
        expect(isSavedView(invalidView)).toBe(false);
      });

      it('should return false for non-object filters', () => {
        const invalidView = { ...createValidSavedView(), filters: 'not-an-object' };
        expect(isSavedView(invalidView)).toBe(false);
      });
    });
  });

  describe('Field Validators', () => {
    describe('validateLeadFields', () => {
      it('should return valid for correct lead', () => {
        const validLead = createValidLead();
        const result = validateLeadFields(validLead);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return errors for missing required fields', () => {
        const invalidLead = { ...createValidLead() };
        delete (invalidLead as any).id;
        delete (invalidLead as any).clientName;
        
        const result = validateLeadFields(invalidLead);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.field === 'id')).toBe(true);
        expect(result.errors.some(e => e.field === 'clientName')).toBe(true);
      });

      it('should return errors for invalid status', () => {
        const invalidLead = { ...createValidLead(), status: 'InvalidStatus' };
        const result = validateLeadFields(invalidLead);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'status')).toBe(true);
      });

      it('should return errors for invalid date format', () => {
        const invalidLead = { ...createValidLead(), followUpDate: '2024-01-01' };
        const result = validateLeadFields(invalidLead);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'followUpDate')).toBe(true);
      });

      it('should return errors for invalid mobileNumbers structure', () => {
        const invalidLead = { ...createValidLead(), mobileNumbers: [{ invalid: 'structure' }] };
        const result = validateLeadFields(invalidLead);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field.includes('mobileNumbers'))).toBe(true);
      });
    });

    describe('validateColumnConfigFields', () => {
      it('should return valid for correct column config', () => {
        const validConfig = createValidColumnConfig();
        const result = validateColumnConfigFields(validConfig);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return errors for missing required fields', () => {
        const invalidConfig = { ...createValidColumnConfig() };
        delete (invalidConfig as any).id;
        delete (invalidConfig as any).fieldKey;
        
        const result = validateColumnConfigFields(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return errors for invalid fieldKey format', () => {
        const invalidConfig = { ...createValidColumnConfig(), fieldKey: '123invalid' };
        const result = validateColumnConfigFields(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'fieldKey')).toBe(true);
      });

      it('should return errors for invalid type', () => {
        const invalidConfig = { ...createValidColumnConfig(), type: 'invalid-type' };
        const result = validateColumnConfigFields(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'type')).toBe(true);
      });

      it('should return errors for invalid width', () => {
        const invalidConfig = { ...createValidColumnConfig(), width: 25 };
        const result = validateColumnConfigFields(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'width')).toBe(true);
      });
    });

    describe('validateHeaderConfigFields', () => {
      it('should return valid for correct header config', () => {
        const validConfig = createValidHeaderConfig();
        const result = validateHeaderConfigFields(validConfig);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return errors for non-string values', () => {
        const invalidConfig = { ...createValidHeaderConfig(), kva: 123 };
        const result = validateHeaderConfigFields(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'kva')).toBe(true);
      });

      it('should return errors for empty string values', () => {
        const invalidConfig = { ...createValidHeaderConfig(), kva: '' };
        const result = validateHeaderConfigFields(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'kva')).toBe(true);
      });
    });

    describe('validateSavedViewFields', () => {
      it('should return valid for correct saved view', () => {
        const validView = createValidSavedView();
        const result = validateSavedViewFields(validView);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return errors for missing required fields', () => {
        const invalidView = { ...createValidSavedView() };
        delete (invalidView as any).id;
        
        const result = validateSavedViewFields(invalidView);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'id')).toBe(true);
      });

      it('should return errors for non-object filters', () => {
        const invalidView = { ...createValidSavedView(), filters: 'not-an-object' };
        const result = validateSavedViewFields(invalidView);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'filters')).toBe(true);
      });
    });
  });

  describe('Array Validators', () => {
    describe('validateLeadArray', () => {
      it('should return valid for array of valid leads', () => {
        const validLeads = [createValidLead(), createValidLead()];
        const result = validateLeadArray(validLeads);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return errors for non-array input', () => {
        const result = validateLeadArray('not-an-array');
        expect(result.valid).toBe(false);
        expect(result.repairable).toBe(false);
      });

      it('should return errors for array with invalid leads', () => {
        const invalidLead = { ...createValidLead() };
        delete (invalidLead as any).id;
        const leads = [createValidLead(), invalidLead];
        
        const result = validateLeadArray(leads);
        expect(result.valid).toBe(false);
        expect(result.repairable).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return not repairable for all invalid leads', () => {
        const invalidLead = { ...createValidLead() };
        delete (invalidLead as any).id;
        const leads = [invalidLead, invalidLead];
        
        const result = validateLeadArray(leads);
        expect(result.valid).toBe(false);
        expect(result.repairable).toBe(false);
      });
    });

    describe('validateColumnConfigArray', () => {
      it('should return valid for array of valid column configs', () => {
        const validConfigs = [createValidColumnConfig(), createValidColumnConfig()];
        const result = validateColumnConfigArray(validConfigs);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return errors for duplicate fieldKeys', () => {
        const config1 = createValidColumnConfig();
        const config2 = { ...createValidColumnConfig(), id: 'different-id' };
        const configs = [config1, config2];
        
        const result = validateColumnConfigArray(configs);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Duplicate field key'))).toBe(true);
      });

      it('should return errors when no columns are visible', () => {
        const config = { ...createValidColumnConfig(), visible: false };
        const configs = [config];
        
        const result = validateColumnConfigArray(configs);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('At least one column must be visible'))).toBe(true);
      });
    });
  });

  describe('Repair Functions', () => {
    describe('repairLead', () => {
      it('should repair lead with missing ID', () => {
        const lead = { ...createValidLead() };
        delete (lead as any).id;
        
        const repaired = repairLead(lead);
        expect(repaired).not.toBeNull();
        expect(repaired!.id).toBeDefined();
        expect(typeof repaired!.id).toBe('string');
      });

      it('should migrate mobileNumber to mobileNumbers array', () => {
        const lead = { ...createValidLead() };
        delete (lead as any).mobileNumbers;
        lead.mobileNumber = '9876543210';
        
        const repaired = repairLead(lead);
        expect(repaired).not.toBeNull();
        expect(repaired!.mobileNumbers).toBeDefined();
        expect(Array.isArray(repaired!.mobileNumbers)).toBe(true);
        expect(repaired!.mobileNumbers.length).toBe(1);
        expect(repaired!.mobileNumbers[0].number).toBe('9876543210');
      });

      it('should add missing boolean flags', () => {
        const lead = { ...createValidLead() };
        delete (lead as any).isDone;
        delete (lead as any).isDeleted;
        delete (lead as any).isUpdated;
        
        const repaired = repairLead(lead);
        expect(repaired).not.toBeNull();
        expect(repaired!.isDone).toBe(false);
        expect(repaired!.isDeleted).toBe(false);
        expect(repaired!.isUpdated).toBe(false);
      });

      it('should add missing activities array', () => {
        const lead = { ...createValidLead() };
        delete (lead as any).activities;
        
        const repaired = repairLead(lead);
        expect(repaired).not.toBeNull();
        expect(Array.isArray(repaired!.activities)).toBe(true);
      });

      it('should return null for completely invalid lead', () => {
        const invalidLead = { invalid: 'data' };
        const repaired = repairLead(invalidLead);
        expect(repaired).toBeNull();
      });
    });

    describe('repairLeadArray', () => {
      it('should repair array of leads', () => {
        const lead1 = { ...createValidLead() };
        const lead2 = { ...createValidLead(), id: 'lead-2' };
        delete (lead1 as any).id;
        
        const leads = [lead1, lead2];
        const result = repairLeadArray(leads);
        
        expect(result.repaired.length).toBe(2);
        expect(result.removed).toBe(0);
        expect(result.errors).toHaveLength(0);
      });

      it('should remove unrepairable leads', () => {
        const validLead = createValidLead();
        const invalidLead = { completely: 'invalid' };
        
        const leads = [validLead, invalidLead];
        const result = repairLeadArray(leads);
        
        expect(result.repaired.length).toBe(1);
        expect(result.removed).toBe(1);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('repairColumnConfig', () => {
      it('should repair column config with missing ID', () => {
        const config = { ...createValidColumnConfig() };
        delete (config as any).id;
        
        const repaired = repairColumnConfig(config);
        expect(repaired).not.toBeNull();
        expect(repaired!.id).toBe(config.fieldKey);
      });

      it('should repair column config with missing visible field', () => {
        const config = { ...createValidColumnConfig() };
        delete (config as any).visible;
        
        const repaired = repairColumnConfig(config);
        expect(repaired).not.toBeNull();
        expect(repaired!.visible).toBe(true);
      });

      it('should repair column config with invalid width', () => {
        const config = { ...createValidColumnConfig(), width: 25 };
        
        const repaired = repairColumnConfig(config);
        expect(repaired).not.toBeNull();
        expect(repaired!.width).toBe(150);
      });

      it('should return null for config without fieldKey', () => {
        const config = { ...createValidColumnConfig() };
        delete (config as any).fieldKey;
        
        const repaired = repairColumnConfig(config);
        expect(repaired).toBeNull();
      });
    });
  });

  describe('Integrity Checks', () => {
    describe('checkDataIntegrity', () => {
      it('should return valid for good data', () => {
        const validData = [createValidLead(), createValidLead()];
        const result = checkDataIntegrity('leads', validData);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect circular references', () => {
        const circularData: any = { name: 'test' };
        circularData.self = circularData;
        
        const result = checkDataIntegrity('leads', circularData);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('circular references'))).toBe(true);
      });

      it('should detect excessive data size', () => {
        const largeData = 'x'.repeat(11 * 1024 * 1024); // 11MB
        const result = checkDataIntegrity('leads', largeData);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('exceeds reasonable limits'))).toBe(true);
      });

      it('should detect suspicious patterns in arrays', () => {
        const suspiciousData = [null, null, null];
        const result = checkDataIntegrity('leads', suspiciousData);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('only null or undefined'))).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined inputs gracefully', () => {
      expect(validateLeadFields(null)).toEqual({
        valid: false,
        errors: expect.any(Array),
        warnings: expect.any(Array),
        repairable: false
      });
    });

    it('should handle empty objects/arrays', () => {
      const result = validateLeadArray([]);
      expect(result.valid).toBe(true);
    });

    it('should handle very large datasets', () => {
      const largeArray = new Array(10001).fill(createValidLead());
      const result = validateLeadArray(largeArray);
      expect(result.warnings.some(w => w.includes('Large data array'))).toBe(true);
    });

    it('should handle special characters in strings', () => {
      const leadWithSpecialChars = {
        ...createValidLead(),
        clientName: 'Test <script>alert("xss")</script> Name'
      };
      const result = validateLeadFields(leadWithSpecialChars);
      expect(result.valid).toBe(true); // Should pass validation, sanitization happens elsewhere
    });
  });
});
