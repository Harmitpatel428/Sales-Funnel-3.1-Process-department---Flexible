import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runMigrations,
  getMigrationPath,
  needsMigration,
  canMigrate,
  getMigrationDescription,
  rollbackMigration
} from '../schemaMigration';
import { isLead, isColumnConfig, isHeaderConfig, isSavedView } from '../schemaValidation';
import type { Lead, MobileNumber } from '../../types/shared';
import type { ColumnConfig } from '../../types/shared';
import type { SavedView } from '../../types/shared';

// Mock storage functions
vi.mock('../storage', () => ({
  createBackup: vi.fn(() => ({ success: true })),
  restoreFromBackup: vi.fn(() => ({ success: true, data: null }))
}));

// Test fixtures for legacy data (version 0.9)
const createLegacyLead = (): any => ({
  // Missing version wrapper
  id: 'legacy-lead-1',
  kva: '100',
  connectionDate: '2024-01-01', // Different date format
  consumerNumber: '12345',
  company: 'Test Company',
  clientName: 'John Doe',
  mobileNumber: '9876543210', // Old string format
  status: 'New',
  lastActivityDate: '2024-01-01', // Different date format
  followUpDate: '2024-01-15', // Different date format
  // Missing boolean flags
  // Missing activities array
  // Missing mobileNumbers array
});

const createLegacyColumnConfig = (): any => ({
  // Missing version wrapper
  fieldKey: 'testField',
  label: 'Test Field',
  type: 'text',
  required: false,
  sortable: true,
  width: 200, // Invalid width
  // Missing id field
  // Missing visible field
  // Missing description field
});

const createLegacyHeaderConfig = (): any => ({
  // Missing version wrapper
  kva: 'KVA <script>alert("xss")</script>', // Unsanitized
  clientName: 'Client Name',
  status: 'Status',
  invalidKey: 123, // Invalid key type
  emptyValue: '' // Empty value
});

const createLegacySavedView = (): any => ({
  // Missing version wrapper
  name: 'Test View',
  filters: {
    status: 'New', // Should be array
    invalidFilter: 'should be removed'
  }
  // Missing id field
});

describe('Schema Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Migration Path Functions', () => {
    describe('getMigrationPath', () => {
      it('should return empty array for same version', () => {
        const path = getMigrationPath('1.0', '1.0', []);
        expect(path).toEqual([]);
      });

      it('should return single migration for adjacent versions', () => {
        const migrations = [{
          fromVersion: '0.9',
          toVersion: '1.0',
          migrate: vi.fn(),
          description: 'Test migration'
        }];
        
        const path = getMigrationPath('0.9', '1.0', migrations);
        expect(path).toHaveLength(1);
        expect(path[0].fromVersion).toBe('0.9');
        expect(path[0].toVersion).toBe('1.0');
      });

      it('should return ordered migration chain for multiple versions', () => {
        const migrations = [
          {
            fromVersion: '0.9',
            toVersion: '1.0',
            migrate: vi.fn(),
            description: 'Migration 1'
          },
          {
            fromVersion: '1.0',
            toVersion: '1.1',
            migrate: vi.fn(),
            description: 'Migration 2'
          }
        ];
        
        const path = getMigrationPath('0.9', '1.1', migrations);
        expect(path).toHaveLength(2);
        expect(path[0].fromVersion).toBe('0.9');
        expect(path[1].fromVersion).toBe('1.0');
      });

      it('should throw error for incompatible versions', () => {
        const migrations = [{
          fromVersion: '0.9',
          toVersion: '1.0',
          migrate: vi.fn(),
          description: 'Test migration'
        }];
        
        expect(() => getMigrationPath('0.8', '1.0', migrations)).toThrow();
      });

      it('should prevent infinite loops', () => {
        const migrations = [{
          fromVersion: '0.9',
          toVersion: '0.9', // Circular migration
          migrate: vi.fn(),
          description: 'Circular migration'
        }];
        
        expect(() => getMigrationPath('0.9', '1.0', migrations)).toThrow('Migration path too long');
      });
    });

    describe('needsMigration', () => {
      it('should return true for different versions', () => {
        expect(needsMigration('0.9', '1.0')).toBe(true);
      });

      it('should return false for same version', () => {
        expect(needsMigration('1.0', '1.0')).toBe(false);
      });
    });

    describe('canMigrate', () => {
      it('should return true for supported migration path', () => {
        expect(canMigrate('leads', '0.9')).toBe(true);
      });

      it('should return false for unsupported key', () => {
        expect(canMigrate('unsupported', '0.9')).toBe(false);
      });

      it('should return false for unsupported version', () => {
        expect(canMigrate('leads', '0.8')).toBe(false);
      });
    });

    describe('getMigrationDescription', () => {
      it('should return description for different versions', () => {
        const description = getMigrationDescription('0.9', '1.0');
        expect(description).toContain('Migrate data from version 0.9 to 1.0');
      });

      it('should return no migration needed for same version', () => {
        const description = getMigrationDescription('1.0', '1.0');
        expect(description).toBe('No migration needed');
      });
    });
  });

  describe('Lead Migrations (0.9 → 1.0)', () => {
    it('should migrate legacy lead data', async () => {
      const legacyLead = createLegacyLead();
      const result = await runMigrations('leads', legacyLead, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(result.migratedFrom).toBe('0.9');
      expect(result.migratedTo).toBe('1.0');
      
      const migratedLead = result.data;
      expect(migratedLead.id).toBeDefined();
      expect(Array.isArray(migratedLead.mobileNumbers)).toBe(true);
      expect(migratedLead.mobileNumbers.length).toBe(1);
      expect(migratedLead.mobileNumbers[0].number).toBe('9876543210');
      expect(typeof migratedLead.isDone).toBe('boolean');
      expect(typeof migratedLead.isDeleted).toBe('boolean');
      expect(typeof migratedLead.isUpdated).toBe('boolean');
      expect(Array.isArray(migratedLead.activities)).toBe(true);
    });

    it('should migrate array of legacy leads', async () => {
      const legacyLeads = [createLegacyLead(), createLegacyLead()];
      const result = await runMigrations('leads', legacyLeads, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      
      result.data.forEach((lead: any) => {
        expect(Array.isArray(lead.mobileNumbers)).toBe(true);
        expect(typeof lead.isDone).toBe('boolean');
      });
    });

    it('should handle migration errors gracefully', async () => {
      const invalidData = { completely: 'invalid' };
      const result = await runMigrations('leads', invalidData, '0.9', '1.0');
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate migrated data', async () => {
      const legacyLead = createLegacyLead();
      const result = await runMigrations('leads', legacyLead, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(isLead(result.data)).toBe(true);
    });
  });

  describe('Column Config Migrations (0.9 → 1.0)', () => {
    it('should migrate legacy column config', async () => {
      const legacyConfig = createLegacyColumnConfig();
      const result = await runMigrations('leadColumnConfig', legacyConfig, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(result.migratedFrom).toBe('0.9');
      expect(result.migratedTo).toBe('1.0');
      
      const migratedConfig = result.data;
      expect(migratedConfig.id).toBeDefined();
      expect(typeof migratedConfig.visible).toBe('boolean');
      expect(typeof migratedConfig.description).toBe('string');
      expect(migratedConfig.width).toBe(150); // Should be fixed to valid range
    });

    it('should migrate array of legacy column configs', async () => {
      const legacyConfigs = [createLegacyColumnConfig(), createLegacyColumnConfig()];
      const result = await runMigrations('leadColumnConfig', legacyConfigs, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      
      result.data.forEach((config: any) => {
        expect(config.id).toBeDefined();
        expect(typeof config.visible).toBe('boolean');
      });
    });

    it('should validate migrated column config', async () => {
      const legacyConfig = createLegacyColumnConfig();
      const result = await runMigrations('leadColumnConfig', legacyConfig, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(isColumnConfig(result.data)).toBe(true);
    });
  });

  describe('Header Config Migrations (0.9 → 1.0)', () => {
    it('should migrate legacy header config', async () => {
      const legacyConfig = createLegacyHeaderConfig();
      const result = await runMigrations('leadHeaderConfig', legacyConfig, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(result.migratedFrom).toBe('0.9');
      expect(result.migratedTo).toBe('1.0');
      
      const migratedConfig = result.data;
      expect(typeof migratedConfig.kva).toBe('string');
      expect(migratedConfig.kva).not.toContain('<script>'); // Should be sanitized
      expect(migratedConfig.invalidKey).toBeUndefined(); // Should be removed
      expect(migratedConfig.emptyValue).toBeUndefined(); // Should be removed
    });

    it('should validate migrated header config', async () => {
      const legacyConfig = createLegacyHeaderConfig();
      const result = await runMigrations('leadHeaderConfig', legacyConfig, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(isHeaderConfig(result.data)).toBe(true);
    });
  });

  describe('Saved View Migrations (0.9 → 1.0)', () => {
    it('should migrate legacy saved view', async () => {
      const legacyView = createLegacySavedView();
      const result = await runMigrations('savedViews', legacyView, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(result.migratedFrom).toBe('0.9');
      expect(result.migratedTo).toBe('1.0');
      
      const migratedView = result.data;
      expect(migratedView.id).toBeDefined();
      expect(Array.isArray(migratedView.filters.status)).toBe(true);
      expect(migratedView.filters.invalidFilter).toBeUndefined(); // Should be removed
    });

    it('should migrate array of legacy saved views', async () => {
      const legacyViews = [createLegacySavedView(), createLegacySavedView()];
      const result = await runMigrations('savedViews', legacyViews, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      
      result.data.forEach((view: any) => {
        expect(view.id).toBeDefined();
        expect(Array.isArray(view.filters.status)).toBe(true);
      });
    });

    it('should validate migrated saved view', async () => {
      const legacyView = createLegacySavedView();
      const result = await runMigrations('savedViews', legacyView, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(isSavedView(result.data)).toBe(true);
    });
  });

  describe('Migration Execution', () => {
    it('should handle no migration needed', async () => {
      const data = { test: 'data' };
      const result = await runMigrations('leads', data, '1.0', '1.0');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(data);
      expect(result.warnings).toContain('No migration needed');
    });

    it('should handle unsupported key', async () => {
      const data = { test: 'data' };
      const result = await runMigrations('unsupported', data, '0.9', '1.0');
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('No migration path found'))).toBe(true);
    });

    it('should create backup before migration', async () => {
      const { createBackup } = await import('../storage');
      const legacyLead = createLegacyLead();
      
      await runMigrations('leads', legacyLead, '0.9', '1.0');
      
      expect(createBackup).toHaveBeenCalledWith('leads');
    });

    it('should handle migration failure', async () => {
      const invalidData = null;
      const result = await runMigrations('leads', invalidData, '0.9', '1.0');
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Rollback Support', () => {
    it('should rollback migration successfully', async () => {
      const { restoreFromBackup } = await import('../storage');
      const result = rollbackMigration('leads');
      
      expect(result).toBe(true);
      expect(restoreFromBackup).toHaveBeenCalledWith('leads');
    });

    it('should handle rollback failure', async () => {
      const { restoreFromBackup } = await import('../storage');
      (restoreFromBackup as any).mockReturnValueOnce({ success: false });
      
      const result = rollbackMigration('leads');
      
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined data', async () => {
      const result = await runMigrations('leads', null, '0.9', '1.0');
      expect(result.success).toBe(false);
    });

    it('should handle empty arrays', async () => {
      const result = await runMigrations('leads', [], '0.9', '1.0');
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(0);
    });

    it('should handle partially migrated data', async () => {
      const partiallyMigrated = {
        ...createLegacyLead(),
        mobileNumbers: [{ id: '1', number: '123', name: 'Test', isMain: true }], // Already migrated
        isDone: false // Already migrated
      };
      
      const result = await runMigrations('leads', partiallyMigrated, '0.9', '1.0');
      expect(result.success).toBe(true);
      expect(result.data.mobileNumbers.length).toBe(1);
    });

    it('should handle data from future version', async () => {
      const futureData = { version: '2.0', data: { test: 'future' } };
      const result = await runMigrations('leads', futureData, '2.0', '1.0');
      
      // Should handle gracefully (no migration path exists)
      expect(result.success).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle full migration pipeline', async () => {
      const legacyLead = createLegacyLead();
      
      // Test migration
      const migrationResult = await runMigrations('leads', legacyLead, '0.9', '1.0');
      expect(migrationResult.success).toBe(true);
      
      // Test validation of migrated data
      const migratedLead = migrationResult.data;
      expect(isLead(migratedLead)).toBe(true);
      
      // Test that migrated data can be used
      expect(migratedLead.mobileNumbers[0].number).toBe('9876543210');
      expect(migratedLead.isDone).toBe(false);
      expect(migratedLead.isDeleted).toBe(false);
      expect(migratedLead.isUpdated).toBe(false);
    });

    it('should preserve data integrity during migration', async () => {
      const legacyLead = createLegacyLead();
      const originalClientName = legacyLead.clientName;
      const originalStatus = legacyLead.status;
      
      const result = await runMigrations('leads', legacyLead, '0.9', '1.0');
      
      expect(result.success).toBe(true);
      expect(result.data.clientName).toBe(originalClientName);
      expect(result.data.status).toBe(originalStatus);
    });
  });
});
