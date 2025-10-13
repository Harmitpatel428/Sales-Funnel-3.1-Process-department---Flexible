import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadAndValidateData,
  loadLeads,
  loadColumnConfig,
  loadHeaderConfig,
  loadSavedViews,
  attemptBackupRecovery,
  attemptPartialRecovery
} from '../dataLoader';
import type { Lead, SavedView } from '../../types/shared';
import type { ColumnConfig } from '../../types/shared';
import { HeaderConfig } from '../../context/HeaderContext';
import { DEFAULT_HEADER_LABELS } from '../../constants/columnConfig';

// Mock dependencies
vi.mock('../storage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  restoreFromBackup: vi.fn()
}));

vi.mock('../storageNotifications', () => ({
  storageNotifications: {
    notify: vi.fn(),
    notifyStorageError: vi.fn(),
    notifyQuotaExceeded: vi.fn()
  }
}));

vi.mock('../debugLogger', () => ({
  logStorage: vi.fn()
}));

vi.mock('../sanitizer', () => ({
  sanitizeLeadArray: vi.fn((data) => data),
  sanitizeColumnConfig: vi.fn((data) => data),
  sanitizeHeaderConfig: vi.fn((data) => data)
}));

vi.mock('../schemaRegistry', () => ({
  isVersionedData: vi.fn(),
  wrapWithVersion: vi.fn((data) => ({ version: '1.0', data, timestamp: new Date().toISOString() })),
  getSchemaVersion: vi.fn(() => '1.0')
}));

vi.mock('../schemaMigration', () => ({
  runMigrations: vi.fn(),
  needsMigration: vi.fn()
}));

vi.mock('../schemaValidation', () => ({
  checkDataIntegrity: vi.fn(),
  validateLeadArray: vi.fn(),
  validateColumnConfigArray: vi.fn(),
  validateHeaderConfigFields: vi.fn(),
  validateSavedViewFields: vi.fn(),
  repairLeadArray: vi.fn()
}));

// Import mocked functions
import { getItem, setItem, restoreFromBackup } from '../storage';
import { storageNotifications } from '../storageNotifications';
import { isVersionedData, wrapWithVersion, getSchemaVersion } from '../schemaRegistry';
import { runMigrations, needsMigration } from '../schemaMigration';
import { checkDataIntegrity, validateLeadArray, repairLeadArray } from '../schemaValidation';

// Test fixtures
const createValidLead = (): Lead => ({
  id: 'test-lead-1',
  kva: '100',
  connectionDate: '01-01-2024',
  consumerNumber: '12345',
  company: 'Test Company',
  clientName: 'John Doe',
  discom: 'UGVCL',
  mobileNumbers: [{
    id: 'mobile-1',
    number: '9876543210',
    name: 'Primary',
    isMain: true
  }],
  mobileNumber: '9876543210',
  status: 'New',
  lastActivityDate: '01-01-2024',
  followUpDate: '15-01-2024',
  isDone: false,
  isDeleted: false,
  isUpdated: false,
  activities: []
});

const createValidColumnConfig = (): ColumnConfig[] => [{
  id: 'test-column',
  fieldKey: 'testField',
  label: 'Test Field',
  type: 'text',
  required: false,
  sortable: true,
  width: 150,
  visible: true
}];

const createValidHeaderConfig = (): HeaderConfig => ({
  kva: 'KVA',
  clientName: 'Client Name',
  status: 'Status'
});

const createValidSavedView = (): SavedView[] => [{
  id: 'test-view',
  name: 'Test View',
  filters: {
    status: ['New', 'Follow-up']
  }
}];

describe('Data Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementations
    (getItem as any).mockReturnValue({ success: true, data: null });
    (setItem as any).mockReturnValue({ success: true });
    (restoreFromBackup as any).mockReturnValue({ success: false, data: null });
    (isVersionedData as any).mockReturnValue(false);
    (needsMigration as any).mockReturnValue(false);
    (checkDataIntegrity as any).mockReturnValue({ valid: true, errors: [], warnings: [] });
    (validateLeadArray as any).mockReturnValue({ valid: true, errors: [], warnings: [], repairable: true });
    (repairLeadArray as any).mockReturnValue({ repaired: [], removed: 0, errors: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadAndValidateData', () => {
    it('should load valid versioned data successfully', async () => {
      const testData = [createValidLead()];
      const versionedData = { version: '1.0', data: testData, timestamp: new Date().toISOString() };
      
      (getItem as any).mockReturnValue({ success: true, data: versionedData });
      (isVersionedData as any).mockReturnValue(true);
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testData);
      expect(result.wasMigrated).toBe(false);
      expect(result.wasRecovered).toBe(false);
    });

    it('should handle legacy data and migrate it', async () => {
      const legacyData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: legacyData });
      (isVersionedData as any).mockReturnValue(false);
      (needsMigration as any).mockReturnValue(true);
      (runMigrations as any).mockReturnValue({
        success: true,
        data: legacyData,
        migratedFrom: '0.9',
        migratedTo: '1.0',
        errors: [],
        warnings: []
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.wasMigrated).toBe(true);
      expect(runMigrations).toHaveBeenCalledWith('leads', legacyData, '0.9', '1.0');
    });

    it('should handle migration failure', async () => {
      const legacyData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: legacyData });
      (isVersionedData as any).mockReturnValue(false);
      (needsMigration as any).mockReturnValue(true);
      (runMigrations as any).mockReturnValue({
        success: false,
        data: legacyData,
        migratedFrom: '0.9',
        migratedTo: '1.0',
        errors: ['Migration failed'],
        warnings: []
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed');
    });

    it('should handle validation failure and attempt repair', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (validateLeadArray as any).mockReturnValue({
        valid: false,
        errors: [{ field: 'test', message: 'Test error' }],
        warnings: [],
        repairable: true
      });
      (repairLeadArray as any).mockReturnValue({
        repaired: testData,
        removed: 0,
        errors: []
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testData);
      expect(result.warnings).toContain('Data was repaired automatically');
    });

    it('should handle unrepairable data and attempt backup recovery', async () => {
      const testData = [createValidLead()];
      const backupData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (validateLeadArray as any).mockReturnValue({
        valid: false,
        errors: [{ field: 'test', message: 'Critical error' }],
        warnings: [],
        repairable: false
      });
      (restoreFromBackup as any).mockReturnValue({ success: true, data: backupData });
      (checkDataIntegrity as any).mockReturnValue({ valid: true, errors: [], warnings: [] });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.wasRecovered).toBe(true);
      expect(result.data).toEqual(backupData);
    });

    it('should fall back to default value when all recovery fails', async () => {
      const testData = [createValidLead()];
      const defaultData: Lead[] = [];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (validateLeadArray as any).mockReturnValue({
        valid: false,
        errors: [{ field: 'test', message: 'Critical error' }],
        warnings: [],
        repairable: false
      });
      (restoreFromBackup as any).mockReturnValue({ success: false, data: null });
      
      const result = await loadAndValidateData('leads', defaultData, { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(defaultData);
      expect(result.warnings).toContain('Using default value due to validation failures');
    });

    it('should handle storage load failure', async () => {
      (getItem as any).mockReturnValue({ success: false, error: 'Storage error' });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load data from storage');
    });

    it('should handle null/undefined data', async () => {
      (getItem as any).mockReturnValue({ success: true, data: null });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should respect load options', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (needsMigration as any).mockReturnValue(true);
      
      // Test with allowMigration: false
      const result = await loadAndValidateData('leads', [], { 
        allowMigration: false, 
        notifyUser: false 
      });
      
      expect(result.success).toBe(true);
      expect(runMigrations).not.toHaveBeenCalled();
    });

    it('should save migrated/recovered data back to storage', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (needsMigration as any).mockReturnValue(true);
      (runMigrations as any).mockReturnValue({
        success: true,
        data: testData,
        migratedFrom: '0.9',
        migratedTo: '1.0',
        errors: [],
        warnings: []
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.wasMigrated).toBe(true);
      expect(setItem).toHaveBeenCalledWith('leads', expect.objectContaining({
        version: '1.0',
        data: testData
      }));
    });
  });

  describe('Specialized Load Functions', () => {
    describe('loadLeads', () => {
      it('should load leads successfully', async () => {
        const testLeads = [createValidLead()];
        
        (getItem as any).mockReturnValue({ success: true, data: testLeads });
        
        const result = await loadLeads();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(testLeads);
      });

      it('should handle partial recovery for leads', async () => {
        const mixedLeads = [createValidLead(), { invalid: 'lead' }];
        const validLeads = [createValidLead()];
        
        (getItem as any).mockReturnValue({ success: true, data: mixedLeads });
        (validateLeadArray as any).mockReturnValue({
          valid: false,
          errors: [{ field: '[1]', message: 'Invalid lead' }],
          warnings: [],
          repairable: true
        });
        (repairLeadArray as any).mockReturnValue({
          repaired: validLeads,
          removed: 1,
          errors: ['Lead 1 could not be repaired and was removed']
        });
        
        const result = await loadLeads();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validLeads);
        expect(result.warnings).toContain('1 leads have validation errors but 1 leads are valid');
      });
    });

    describe('loadColumnConfig', () => {
      it('should load column config successfully', async () => {
        const testConfig = createValidColumnConfig();
        
        (getItem as any).mockReturnValue({ success: true, data: testConfig });
        
        const result = await loadColumnConfig();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(testConfig);
      });

      it('should fall back to DEFAULT_COLUMNS on failure', async () => {
        (getItem as any).mockReturnValue({ success: false, error: 'Load failed' });
        
        const result = await loadColumnConfig();
        
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
      });
    });

    describe('loadHeaderConfig', () => {
      it('should load header config successfully', async () => {
        const testConfig = createValidHeaderConfig();
        
        (getItem as any).mockReturnValue({ success: true, data: testConfig });
        
        const result = await loadHeaderConfig();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(testConfig);
      });

      it('should fall back to DEFAULT_HEADER_LABELS on failure', async () => {
        (getItem as any).mockReturnValue({ success: false, error: 'Load failed' });
        
        const result = await loadHeaderConfig();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(DEFAULT_HEADER_LABELS);
      });
    });

    describe('loadSavedViews', () => {
      it('should load saved views successfully', async () => {
        const testViews = createValidSavedView();
        
        (getItem as any).mockReturnValue({ success: true, data: testViews });
        
        const result = await loadSavedViews();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(testViews);
      });

      it('should handle empty saved views', async () => {
        (getItem as any).mockReturnValue({ success: true, data: [] });
        
        const result = await loadSavedViews();
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
      });
    });
  });

  describe('Recovery Helpers', () => {
    describe('attemptBackupRecovery', () => {
      it('should recover from backup successfully', async () => {
        const backupData = [createValidLead()];
        
        (restoreFromBackup as any).mockReturnValue({ success: true, data: backupData });
        (checkDataIntegrity as any).mockReturnValue({ valid: true, errors: [], warnings: [] });
        
        const result = await attemptBackupRecovery<Lead[]>('leads');
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(backupData);
        expect(result.error).toBeNull();
      });

      it('should handle backup recovery failure', async () => {
        (restoreFromBackup as any).mockReturnValue({ success: false, error: 'No backup' });
        
        const result = await attemptBackupRecovery<Lead[]>('leads');
        
        expect(result.success).toBe(false);
        expect(result.data).toBeNull();
        expect(result.error).toBe('No backup');
      });

      it('should handle corrupted backup data', async () => {
        const corruptedData = { invalid: 'backup' };
        
        (restoreFromBackup as any).mockReturnValue({ success: true, data: corruptedData });
        (checkDataIntegrity as any).mockReturnValue({ valid: false, errors: ['Corrupted'], warnings: [] });
        
        const result = await attemptBackupRecovery<Lead[]>('leads');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Recovered data failed integrity check');
      });
    });

    describe('attemptPartialRecovery', () => {
      it('should recover valid items from array', () => {
        const items = [
          { id: 1, valid: true },
          { id: 2, valid: false },
          { id: 3, valid: true }
        ];
        
        const validator = (item: any) => item.valid;
        const result = attemptPartialRecovery(items, validator);
        
        expect(result.recovered).toHaveLength(2);
        expect(result.recovered[0].id).toBe(1);
        expect(result.recovered[1].id).toBe(3);
        expect(result.removed).toBe(1);
      });

      it('should handle empty array', () => {
        const result = attemptPartialRecovery([], () => true);
        
        expect(result.recovered).toHaveLength(0);
        expect(result.removed).toBe(0);
      });

      it('should handle all invalid items', () => {
        const items = [
          { id: 1, valid: false },
          { id: 2, valid: false }
        ];
        
        const validator = (item: any) => item.valid;
        const result = attemptPartialRecovery(items, validator);
        
        expect(result.recovered).toHaveLength(0);
        expect(result.removed).toBe(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      (getItem as any).mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error during data loading');
    });

    it('should handle validation throwing error', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (validateLeadArray as any).mockImplementation(() => {
        throw new Error('Validation error');
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error during data loading');
    });

    it('should handle migration throwing error', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (needsMigration as any).mockReturnValue(true);
      (runMigrations as any).mockImplementation(() => {
        throw new Error('Migration error');
      });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error during data loading');
    });
  });

  describe('Notification Integration', () => {
    it('should send notifications for successful migration', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (needsMigration as any).mockReturnValue(true);
      (runMigrations as any).mockReturnValue({
        success: true,
        data: testData,
        migratedFrom: '0.9',
        migratedTo: '1.0',
        errors: [],
        warnings: []
      });
      
      await loadAndValidateData('leads', [], { notifyUser: true });
      
      expect(storageNotifications.notify).toHaveBeenCalledWith(
        expect.stringContaining('Successfully migrated leads data to version 1.0'),
        'success'
      );
    });

    it('should send notifications for validation failures', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (validateLeadArray as any).mockReturnValue({
        valid: false,
        errors: [{ field: 'test', message: 'Test error' }],
        warnings: [],
        repairable: false
      });
      (restoreFromBackup as any).mockReturnValue({ success: false, data: null });
      
      await loadAndValidateData('leads', [], { notifyUser: true });
      
      expect(storageNotifications.notify).toHaveBeenCalledWith(
        expect.stringContaining('Using default values for leads due to data corruption'),
        'warning'
      );
    });

    it('should send notifications for successful recovery', async () => {
      const testData = [createValidLead()];
      const backupData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      (validateLeadArray as any).mockReturnValue({
        valid: false,
        errors: [{ field: 'test', message: 'Test error' }],
        warnings: [],
        repairable: false
      });
      (restoreFromBackup as any).mockReturnValue({ success: true, data: backupData });
      (checkDataIntegrity as any).mockReturnValue({ valid: true, errors: [], warnings: [] });
      
      await loadAndValidateData('leads', [], { notifyUser: true });
      
      expect(storageNotifications.notify).toHaveBeenCalledWith(
        expect.stringContaining('Successfully recovered leads from backup'),
        'success'
      );
    });
  });

  describe('Integration Tests', () => {
    it('should handle full pipeline: load → migrate → validate → save', async () => {
      const legacyData = [createValidLead()];
      const migratedData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: legacyData });
      (isVersionedData as any).mockReturnValue(false);
      (needsMigration as any).mockReturnValue(true);
      (runMigrations as any).mockReturnValue({
        success: true,
        data: migratedData,
        migratedFrom: '0.9',
        migratedTo: '1.0',
        errors: [],
        warnings: []
      });
      (setItem as any).mockReturnValue({ success: true });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.wasMigrated).toBe(true);
      expect(setItem).toHaveBeenCalledWith('leads', expect.objectContaining({
        version: '1.0',
        data: migratedData
      }));
    });

    it('should handle data consistency across load-save cycles', async () => {
      const testData = [createValidLead()];
      
      (getItem as any).mockReturnValue({ success: true, data: testData });
      
      const result = await loadAndValidateData('leads', [], { notifyUser: false });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testData);
      
      // Verify data can be loaded again
      const result2 = await loadAndValidateData('leads', [], { notifyUser: false });
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual(testData);
    });
  });
});
