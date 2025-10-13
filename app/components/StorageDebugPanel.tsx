/**
 * StorageDebugPanel - Development-only debug panel for storage monitoring
 * 
 * This component provides visibility into storage health, quota usage, and backup status
 * during development. It should NOT be included in production builds.
 * 
 * Features:
 * - Real-time storage statistics
 * - Backup management
 * - Storage export/import
 * - Quota monitoring
 * 
 * To enable in development:
 * 1. Uncomment the StorageDebugPanel import in layout.tsx
 * 2. Add <StorageDebugPanel /> to the layout
 * 3. Only renders when process.env.NODE_ENV === 'development'
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getStorageStats, clearAllBackups, exportStorage, importStorage, dryRunImport } from '../utils/storage';

interface StorageStats {
  totalSize: number;
  percentUsed: number;
  itemCount: number;
  largestKey: string;
  largestSize: number;
  quotaLimit: number;
}

export default function StorageDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Only render in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  // Load storage stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        const storageStats = await getStorageStats();
        setStats(storageStats);
      } catch (error) {
        console.error('Failed to load storage stats:', error);
      }
    };

    loadStats();
  }, [refreshKey]);

  const handleRefreshStats = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleOpenModal = () => {
    setIsOpen(true);
    // Focus first interactive element after modal opens
    setTimeout(() => {
      firstFocusableRef.current?.focus();
    }, 100);
  };

  const handleCloseModal = () => {
    setIsOpen(false);
    // Return focus to toggle button
    setTimeout(() => {
      toggleButtonRef.current?.focus();
    }, 100);
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCloseModal();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
    
    return undefined;
  }, [isOpen]);

  // Focus trap for modal
  useEffect(() => {
    if (!isOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  const handleClearBackups = () => {
    if (window.confirm('Are you sure you want to clear all backups? This action cannot be undone.')) {
      try {
        clearAllBackups();
        alert('All backups cleared successfully');
        handleRefreshStats();
      } catch (error) {
        alert(`Failed to clear backups: ${error}`);
      }
    }
  };

  const handleExportStorage = () => {
    try {
      const data = exportStorage();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storage-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Failed to export storage: ${error}`);
    }
  };

  const handleImportStorage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const jsonString = e.target?.result as string;
            
            // First, perform dry-run validation
            const validation = dryRunImport(jsonString);
            if (!validation.valid) {
              alert(`Import validation failed:\n${validation.errors.join('\n')}`);
              return;
            }
            
            // Show validation warnings if any
            if (validation.warnings.length > 0) {
              const proceed = confirm(
                `Import validation completed with warnings:\n${validation.warnings.join('\n')}\n\n` +
                `Projected size: ${(validation.projectedSize / 1024 / 1024).toFixed(2)}MB\n` +
                `Items: ${validation.itemCount}\n\n` +
                'Do you want to proceed with the import?'
              );
              if (!proceed) return;
            }
            
            // Perform the actual import
            const result = await importStorage(jsonString, {
              createBackup: true,
              validateKeys: true
            });
            
            if (result.success) {
              alert('Storage imported successfully');
              handleRefreshStats();
            } else {
              alert(`Import failed: ${result.error}`);
            }
          } catch (error) {
            alert(`Failed to import storage: ${error}`);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const getUsageColor = (percent: number) => {
    if (percent < 0.5) return 'text-green-600';
    if (percent < 0.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getUsageBgColor = (percent: number) => {
    if (percent < 0.5) return 'bg-green-100';
    if (percent < 0.8) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  // ARIA-compliant string values for aria-expanded
  const ariaExpanded = isOpen ? 'true' : 'false';

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          ref={toggleButtonRef}
          type="button"
          onClick={isOpen ? handleCloseModal : handleOpenModal}
          className={`p-3 rounded-full shadow-lg transition-all duration-200 ${
            stats ? getUsageBgColor(stats.percentUsed) : 'bg-gray-100'
          } hover:scale-105`}
          aria-label={isOpen ? 'Close storage debug panel' : 'Open storage debug panel'}
          {/* eslint-disable-next-line axe/aria -- ariaExpanded contains the required "true"/"false" string values per ARIA spec */}
          aria-expanded={ariaExpanded}
          title="Storage Debug Panel"
        >
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
            </svg>
            {stats && (
              <span className={`text-sm font-medium ${getUsageColor(stats.percentUsed)}`}>
                {Math.round(stats.percentUsed * 100)}%
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <div 
          ref={modalRef}
          id="storage-debug-modal"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="storage-debug-title"
          aria-describedby="storage-debug-description"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 id="storage-debug-title" className="text-xl font-semibold text-gray-900">Storage Debug Panel</h2>
                <p id="storage-debug-description" className="sr-only">
                  Storage usage statistics and management tools for debugging and monitoring localStorage data.
                </p>
                <button
                  ref={firstFocusableRef}
                  type="button"
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close storage debug panel"
                  title="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {stats ? (
                <div className="space-y-6">
                  {/* Storage Statistics */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Storage Statistics</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-gray-600">Total Size</div>
                        <div className="text-lg font-semibold">
                          {(stats.totalSize / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Usage</div>
                        <div className={`text-lg font-semibold ${getUsageColor(stats.percentUsed)}`}>
                          {Math.round(stats.percentUsed * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Items</div>
                        <div className="text-lg font-semibold">{stats.itemCount}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Largest Item</div>
                        <div className="text-lg font-semibold truncate" title={stats.largestKey}>
                          {stats.largestKey}
                        </div>
                        <div className="text-sm text-gray-500">
                          {(stats.largestSize / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Usage Bar */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Storage Usage</span>
                      <span>{Math.round(stats.percentUsed * 100)}%</span>
                    </div>
                    <progress
                      className={`storage-progress w-full h-2 rounded-full ${
                        stats.percentUsed < 0.5
                          ? 'text-green-500'
                          : stats.percentUsed < 0.8
                          ? 'text-yellow-500'
                          : 'text-red-500'
                      }`}
                      value={Math.min(Math.round(stats.percentUsed * 100), 100)}
                      max={100}
                      aria-label={`Storage usage: ${Math.round(stats.percentUsed * 100)}%`}
                      aria-describedby="storage-usage-description"
                    />
                    <div id="storage-usage-description" className="sr-only">
                      Current storage usage is {Math.round(stats.percentUsed * 100)}% of available quota.
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleRefreshStats}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Refresh Stats
                    </button>
                    <button
                      type="button"
                      onClick={handleClearBackups}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Clear Backups
                    </button>
                    <button
                      type="button"
                      onClick={handleExportStorage}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Export Storage
                    </button>
                    <button
                      type="button"
                      onClick={handleImportStorage}
                      className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                    >
                      Import Storage
                    </button>
                  </div>

                  {/* Warning Messages */}
                  {stats.percentUsed > 0.8 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex">
                        <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">Storage Warning</h3>
                          <div className="mt-2 text-sm text-red-700">
                            <p>Storage usage is above 80%. Consider exporting and archiving old data to prevent data loss.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {stats.percentUsed > 0.95 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex">
                        <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">Critical Storage Alert</h3>
                          <div className="mt-2 text-sm text-red-700">
                            <p>Storage usage is critically high. Immediate action required to prevent data loss.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading storage statistics...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Usage Instructions:
 * 
 * To enable this debug panel in development:
 * 
 * 1. In app/layout.tsx, add the import:
 *    import StorageDebugPanel from './components/StorageDebugPanel';
 * 
 * 2. Add the component to the layout:
 *    <StorageDebugPanel />
 * 
 * 3. The panel will only render when NODE_ENV === 'development'
 * 
 * Features:
 * - Real-time storage usage monitoring
 * - Backup management (clear all backups)
 * - Storage export/import for debugging
 * - Visual warnings when approaching storage limits
 * - Floating button shows current usage percentage
 * 
 * Note: This component is for development use only and should not be included in production builds.
 */
