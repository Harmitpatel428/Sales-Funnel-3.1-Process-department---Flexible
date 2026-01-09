'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DEFAULT_HEADER_LABELS } from '../constants/columnConfig';
import { validateHeaderName, sanitizeHeaderName } from '../hooks/useValidation';

// Header configuration type - maps field keys to custom display names
export type HeaderConfig = Record<string, string>;

// Context type definition
interface HeaderContextType {
  headerConfig: HeaderConfig;
  updateHeader: (field: string, newLabel: string) => void;
  addHeader: (fieldKey: string, label: string) => void;
  removeHeader: (fieldKey: string) => void;
  resetHeaders: () => void;
  getDisplayName: (field: string) => string;
  isCustomized: boolean;
}

// Create the context
const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

// Provider component
export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(DEFAULT_HEADER_LABELS);

  // Load configuration from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('leadHeaderConfig');
      if (saved) {
        const parsedConfig = JSON.parse(saved);
        // Validate that all required fields are present
        const validatedConfig = { ...DEFAULT_HEADER_LABELS };
        Object.keys(DEFAULT_HEADER_LABELS).forEach(key => {
          if (parsedConfig[key] && typeof parsedConfig[key] === 'string') {
            validatedConfig[key as keyof typeof DEFAULT_HEADER_LABELS] = parsedConfig[key];
          }
        });
        setHeaderConfig(validatedConfig);
      }
    } catch (error) {
      console.error('Error loading header configuration:', error);
      setHeaderConfig(DEFAULT_HEADER_LABELS);
    }
  }, []);

  // Debounced save to localStorage
  const saveToStorage = useCallback(
    debounce((config: HeaderConfig) => {
      try {
        localStorage.setItem('leadHeaderConfig', JSON.stringify(config));
      } catch (error) {
        console.error('Error saving header configuration:', error);
      }
    }, 500),
    []
  );

  // Update header configuration
  const updateHeader = useCallback((field: string, newLabel: string) => {
    const trimmedLabel = newLabel.trim();

    // Build existing headers for validation
    const existingHeaders = Object.values(headerConfig);

    // Use shared validation helper
    const err = validateHeaderName(trimmedLabel, existingHeaders, field);
    if (err) {
      throw new Error(err);
    }

    // Sanitize the label
    const sanitizedLabel = sanitizeHeaderName(trimmedLabel);

    setHeaderConfig(prev => {
      const newConfig = { ...prev, [field]: sanitizedLabel };
      saveToStorage(newConfig);
      return newConfig;
    });
  }, [headerConfig, saveToStorage]);

  // Reset headers to defaults
  const resetHeaders = useCallback(() => {
    setHeaderConfig(DEFAULT_HEADER_LABELS);
    try {
      localStorage.removeItem('leadHeaderConfig');
    } catch (error) {
      console.error('Error removing header configuration:', error);
    }
  }, []);

  // Add new header
  const addHeader = useCallback((fieldKey: string, label: string) => {
    const trimmedLabel = label.trim();
    const sanitizedLabel = sanitizeHeaderName(trimmedLabel);

    setHeaderConfig(prev => {
      const newConfig = { ...prev, [fieldKey]: sanitizedLabel };
      saveToStorage(newConfig);
      return newConfig;
    });
  }, [saveToStorage]);

  // Remove header
  const removeHeader = useCallback((fieldKey: string) => {
    setHeaderConfig(prev => {
      const newConfig = { ...prev };
      delete newConfig[fieldKey];
      saveToStorage(newConfig);
      return newConfig;
    });
  }, [saveToStorage]);

  // Get display name for a field
  const getDisplayName = useCallback((field: string) => {
    return headerConfig[field] || DEFAULT_HEADER_LABELS[field as keyof typeof DEFAULT_HEADER_LABELS] || field;
  }, [headerConfig]);

  // Check if headers are customized - memoized
  const isCustomized = useMemo(() => Object.keys(headerConfig).some(
    key => headerConfig[key] !== DEFAULT_HEADER_LABELS[key as keyof typeof DEFAULT_HEADER_LABELS]
  ), [headerConfig]);

  const value: HeaderContextType = useMemo(() => ({
    headerConfig,
    updateHeader,
    addHeader,
    removeHeader,
    resetHeaders,
    getDisplayName,
    isCustomized
  }), [headerConfig, updateHeader, addHeader, removeHeader, resetHeaders, getDisplayName, isCustomized]);

  return (
    <HeaderContext.Provider value={value}>
      {children}
    </HeaderContext.Provider>
  );
}

// Custom hook to use the header context
export function useHeaders(): HeaderContextType {
  const context = useContext(HeaderContext);
  if (context === undefined) {
    throw new Error('useHeaders must be used within a HeaderProvider');
  }
  return context;
}

// Debounce utility function
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
