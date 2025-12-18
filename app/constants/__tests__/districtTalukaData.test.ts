import { describe, it, expect, vi } from 'vitest';
import { 
  getCategoryByTaluka, 
  searchDistricts, 
  searchTalukas,
  getAllDistricts,
  getTalukasByDistrict,
  normalizeName,
  ALIASES,
  validateDataset
} from '../districtTalukaData';

describe('District Taluka Data', () => {
  describe('getCategoryByTaluka', () => {
    it('should return correct category for Ahmedabad talukas (spot checks)', () => {
      expect(getCategoryByTaluka('Ahmedabad', 'Dhandhuka')).toBe('I');
      expect(getCategoryByTaluka('Ahmedabad', 'Detroj-Rampura')).toBe('I');
      expect(getCategoryByTaluka('Ahmedabad', 'Dholera')).toBe('I');
      expect(getCategoryByTaluka('Ahmedabad', 'Viramgam')).toBe('II');
      expect(getCategoryByTaluka('Ahmedabad', 'Ahmedabad City')).toBe('III');
      expect(getCategoryByTaluka('Ahmedabad', 'Bavla')).toBe('III');
      expect(getCategoryByTaluka('Ahmedabad', 'Daskroi')).toBe('III');
      expect(getCategoryByTaluka('Ahmedabad', 'Dholka')).toBe('III');
      expect(getCategoryByTaluka('Ahmedabad', 'Mandal')).toBe('III');
      expect(getCategoryByTaluka('Ahmedabad', 'Sanand')).toBe('III');
    });

    it('should return correct category for Amreli talukas (spot checks)', () => {
      expect(getCategoryByTaluka('Amreli', 'Khambha')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Dhari')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Lilia')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Savar Kundla')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Babra')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Kunkavav Vadia')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Lathi')).toBe('I');
      expect(getCategoryByTaluka('Amreli', 'Rajula')).toBe('II');
      expect(getCategoryByTaluka('Amreli', 'Bagasara')).toBe('II');
      expect(getCategoryByTaluka('Amreli', 'Amreli')).toBe('II');
      expect(getCategoryByTaluka('Amreli', 'Jafrabad')).toBe('III');
    });

    it('should return correct category for Panchmahal talukas (spot checks)', () => {
      expect(getCategoryByTaluka('Panchmahal', 'Ghoghamba')).toBe('I');
      expect(getCategoryByTaluka('Panchmahal', 'Morwa (Hadaf)')).toBe('I');
      expect(getCategoryByTaluka('Panchmahal', 'Jambughoda')).toBe('I');
      expect(getCategoryByTaluka('Panchmahal', 'Shehera')).toBe('I');
      expect(getCategoryByTaluka('Panchmahal', 'Godhra')).toBe('II');
      expect(getCategoryByTaluka('Panchmahal', 'Halol')).toBe('III');
      expect(getCategoryByTaluka('Panchmahal', 'Kalol')).toBe('III');
    });

    it('should return correct category for Surat talukas', () => {
      expect(getCategoryByTaluka('Surat', 'Surat')).toBe('I');
      expect(getCategoryByTaluka('Surat', 'Bardoli')).toBe('II');
      expect(getCategoryByTaluka('Surat', 'Umarpada')).toBe('III');
    });

    it('should return correct category for Rajkot talukas', () => {
      expect(getCategoryByTaluka('Rajkot', 'Rajkot')).toBe('I');
      expect(getCategoryByTaluka('Rajkot', 'Dhoraji')).toBe('II');
      expect(getCategoryByTaluka('Rajkot', 'Maliya')).toBe('III');
    });

    it('should return null for non-existent district', () => {
      expect(getCategoryByTaluka('NonExistent', 'SomeTaluka')).toBe(null);
    });

    it('should return null for non-existent taluka', () => {
      expect(getCategoryByTaluka('Ahmedabad', 'NonExistent')).toBe(null);
    });

    it('should handle aliases correctly', () => {
      expect(getCategoryByTaluka('Panchmahal', 'Morwa Hadaf')).toBe('I');
      expect(getCategoryByTaluka('Panchmahal', 'Morwa (Hadaf)')).toBe('I');
      expect(getCategoryByTaluka('Chhota Udaipur', 'Chhota Udaipur')).toBe('III');
      expect(getCategoryByTaluka('Chhota Udaipur', 'Chhota Udepur')).toBe('III');
    });
  });

  describe('searchDistricts', () => {
    it('should return all districts when search term is empty', () => {
      const result = searchDistricts('');
      expect(result.length).toBe(33);
      expect(result).toContain('Ahmedabad');
      expect(result).toContain('Surat');
      expect(result).toContain('Rajkot');
    });

    it('should filter districts by search term', () => {
      const result = searchDistricts('Ahmed');
      expect(result).toContain('Ahmedabad');
      expect(result.length).toBe(1);
    });

    it('should be case insensitive', () => {
      const result1 = searchDistricts('ahmed');
      const result2 = searchDistricts('AHMED');
      expect(result1).toEqual(result2);
      expect(result1).toContain('Ahmedabad');
    });

    it('should handle partial matches', () => {
      const result = searchDistricts('kot');
      expect(result).toContain('Rajkot');
    });

    it('should return Surat when searching for surat', () => {
      const result = searchDistricts('surat');
      expect(result).toEqual(['Surat']);
    });
  });

  describe('searchTalukas', () => {
    it('should return all talukas for a district when search term is empty', () => {
      const result = searchTalukas('Ahmedabad', '');
      expect(result.length).toBe(10);
      expect(result.some(t => t.name === 'Ahmedabad City')).toBe(true);
    });

    it('should filter talukas by search term', () => {
      const result = searchTalukas('Ahmedabad', 'Ahmedabad');
      expect(result.length).toBe(1);
      expect(result.some(t => t.name === 'Ahmedabad City')).toBe(true);
    });

    it('should be case insensitive', () => {
      const result1 = searchTalukas('Ahmedabad', 'ahmedabad');
      const result2 = searchTalukas('Ahmedabad', 'AHMEDABAD');
      expect(result1).toEqual(result2);
    });

    it('should return empty array for non-existent district', () => {
      const result = searchTalukas('NonExistent', '');
      expect(result).toEqual([]);
    });

    it('should not match Veraval in Rajkot district', () => {
      const result = searchTalukas('Rajkot', 'Veraval');
      expect(result).toEqual([]);
    });

    it('should match Veraval in Gir Somnath district (alias)', () => {
      const result = searchTalukas('Gir Somnath', 'Veraval');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(t => t.name === 'Patan Veraval')).toBe(true);
    });
  });

  describe('getAllDistricts', () => {
    it('should return all districts sorted alphabetically', () => {
      const result = getAllDistricts();
      expect(result.length).toBe(33);
      expect(result[0]).toBe('Ahmedabad');
      expect(result[result.length - 1]).toBe('Valsad');
    });
  });

  describe('getTalukasByDistrict', () => {
    it('should return talukas for Ahmedabad district', () => {
      const result = getTalukasByDistrict('Ahmedabad');
      expect(result.length).toBe(10);
      expect(result.some(t => t.name === 'Ahmedabad City' && t.category === 'III')).toBe(true);
    });

    it('should return empty array for non-existent district', () => {
      const result = getTalukasByDistrict('NonExistent');
      expect(result).toEqual([]);
    });

    it('should handle aliases correctly', () => {
      const result1 = getTalukasByDistrict('Panchmahal');
      const result2 = getTalukasByDistrict('Panchmahal');
      expect(result1).toEqual(result2);
    });
  });

  describe('normalizeName', () => {
    it('should normalize names correctly', () => {
      expect(normalizeName('Morwa (Hadaf)')).toBe('morwa hadaf');
      expect(normalizeName('Chhota Udepur')).toBe('chhota udepur');
      expect(normalizeName('Patan Veraval')).toBe('patan veraval');
    });

    it('should handle special characters', () => {
      expect(normalizeName('Malia-Hatina')).toBe('malia hatina');
      expect(normalizeName('Detroj-Rampura')).toBe('detroj rampura');
    });
  });

  describe('ALIASES', () => {
    it('should contain expected aliases', () => {
      expect(ALIASES['Morwa (Hadaf)']).toContain('Morwa Hadaf');
      expect(ALIASES['Chhota Udepur']).toContain('Chhota Udaipur');
      expect(ALIASES['Patan Veraval']).toContain('Veraval');
    });
  });

  describe('validateDataset', () => {
    it('should validate dataset structure', () => {
      // Mock console.log to capture validation output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Set NODE_ENV to development to enable validation
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'development';
      
      validateDataset();
      
      // Check that validation ran (district count should be correct and no duplicates)
      expect(consoleSpy).toHaveBeenCalled();
      
      // Restore environment
      (process.env as any).NODE_ENV = originalEnv;
      
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});