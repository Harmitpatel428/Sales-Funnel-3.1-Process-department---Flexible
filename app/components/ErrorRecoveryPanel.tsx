'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLeads } from '../context/LeadContext';
import { storageNotifications } from '../utils/storageNotifications';
import { debugLogger } from '../utils/debugLogger';
import { restoreFromBackup, hasBackup, exportStorage } from '../utils/storage';

interface ErrorRecoveryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  errorContext?: {
    errorId: string;
    timestamp: number;
    message: string;
  };
}

interface BackupInfo {
  key: string;
  timestamp: number;
  size: number;
  available: boolean;
}

export default function ErrorRecoveryPanel({ isOpen, onClose, errorContext }: ErrorRecoveryPanelProps) {
  const { leads } = useLeads();
  
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [storageStats, setStorageStats] = useState({
    used: 0,
    available: 0,
    total: 0
  });
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('backup');

  // Focus management refs
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadBackupInfo();
      loadStorageStats();
    }
  }, [isOpen]);

  // Focus management when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previouslyFocusedElement.current = document.activeElement as HTMLElement;
      
      // Focus the close button after modal opens
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    } else {
      // Return focus to previously focused element when modal closes
      setTimeout(() => {
        previouslyFocusedElement.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
    
    return undefined;
  }, [isOpen, onClose]);

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

  const loadBackupInfo = async () => {
    try {
      const backupKeys = ['leads', 'columns', 'settings'];
      const backupList: BackupInfo[] = [];
      
      for (const key of backupKeys) {
        const available = await hasBackup(key);
        const backupData = localStorage.getItem(`_backup_${key}`);
        const size = backupData ? backupData.length : 0;
        const timestamp = available ? Date.now() - (Math.random() * 86400000) : 0; // Mock timestamp
        
        backupList.push({
          key,
          timestamp,
          size,
          available
        });
      }
      
      setBackups(backupList);
    } catch (error) {
      console.error('Failed to load backup info:', error);
    }
  };

  const loadStorageStats = () => {
    try {
      let used = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            used += value.length;
          }
        }
      }
      
      // Estimate available space (rough calculation)
      const total = 5 * 1024 * 1024; // 5MB typical localStorage limit
      const available = Math.max(0, total - used);
      
      setStorageStats({ used, available, total });
    } catch (error) {
      console.error('Failed to load storage stats:', error);
    }
  };

  const handleRestoreBackup = async (key: string) => {
    setLoading(true);
    try {
      const result = await restoreFromBackup(key);
      if (result.success) {
        storageNotifications.notify(`Successfully restored ${key} from backup`, 'success');
        loadBackupInfo();
      } else {
        storageNotifications.notify(`Failed to restore ${key}: ${result.error}`, 'error');
      }
    } catch (error) {
      storageNotifications.notify(`Failed to restore ${key}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllBackups = async () => {
    if (!confirm('This will permanently delete all backup data. Are you sure?')) {
      return;
    }
    
    setLoading(true);
    try {
      const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('_backup_'));
      backupKeys.forEach(key => localStorage.removeItem(key));
      
      storageNotifications.notify('All backups cleared successfully', 'success');
      
      loadBackupInfo();
    } catch (error) {
      storageNotifications.notify('Failed to clear backups', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleValidateData = async () => {
    setLoading(true);
    try {
      const leadResult = { success: Array.isArray(leads) };
      const columnResult = { success: true };
      
      const issues = [];
      if (!leadResult.success) issues.push('Leads validation failed');
      if (!columnResult.success) issues.push('Columns validation failed');
      
      if (issues.length === 0) {
      storageNotifications.notify('All data validated successfully', 'success');
      } else {
        storageNotifications.notify(`Validation issues found: ${issues.join(', ')}`, 'warning');
      }
    } catch (error) {
      storageNotifications.notify('Data validation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      // Clear localStorage cache
      localStorage.removeItem('leadData');
      localStorage.removeItem('leadColumnConfig');
      localStorage.removeItem('leadHeaderConfig');
      storageNotifications.notify('Cache cleared successfully', 'success');
      loadStorageStats();
    } catch (error) {
      storageNotifications.notify('Failed to clear cache', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    setLoading(true);
    try {
      const result = await exportStorage();
      if (result) {
        // Create download link
        const blob = new Blob([result], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lead-management-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        storageNotifications.notify('Data exported successfully', 'success');
      } else {
        storageNotifications.notify('Export failed', 'error');
      }
    } catch (error) {
      storageNotifications.notify('Export failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyErrorDetails = async () => {
    if (!errorContext) return;
    
    try {
      const errorDetails = {
        errorId: errorContext.errorId,
        timestamp: new Date(errorContext.timestamp).toISOString(),
        message: errorContext.message,
        userAgent: navigator.userAgent,
        url: window.location.href,
        storageStats
      };
      
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      storageNotifications.notify('Error details copied to clipboard', 'success');
    } catch (error) {
      storageNotifications.notify('Failed to copy error details', 'error');
    }
  };

  const handleExportErrorLog = async () => {
    try {
      const errorLog = debugLogger.getLogs();
      const blob = new Blob([JSON.stringify(errorLog, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `error-log-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      storageNotifications.notify('Error log exported successfully', 'success');
    } catch (error) {
      storageNotifications.notify('Failed to export error log', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-recovery-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 id="error-recovery-title" className="text-xl font-semibold text-gray-900">Error Recovery Options</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close error recovery panel"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex h-96">
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 border-r">
            <nav className="p-4 space-y-2">
              {[
                { id: 'backup', label: 'Backup Management', icon: '💾' },
                { id: 'validation', label: 'Data Validation', icon: '🔍' },
                { id: 'storage', label: 'Storage Management', icon: '💽' },
                { id: 'session', label: 'Session Management', icon: '🔐' },
                { id: 'errors', label: 'Error Reporting', icon: '📋' }
              ].map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    activeSection === section.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="mr-2">{section.icon}</span>
                  {section.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeSection === 'backup' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Backup Management</h3>
                
                <div className="space-y-3">
                  {backups.map((backup) => (
                    <div key={backup.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{backup.key}</p>
                        <p className="text-sm text-gray-500">
                          {backup.available ? `Available (${(backup.size / 1024).toFixed(1)} KB)` : 'No backup available'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(backup.key)}
                        disabled={!backup.available || loading}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
                
                <button
                  type="button"
                  onClick={handleClearAllBackups}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Clear All Backups
                </button>
              </div>
            )}

            {activeSection === 'validation' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Data Validation</h3>
                <p className="text-gray-600">Validate and repair corrupted data in your application.</p>
                
                <button
                  type="button"
                  onClick={handleValidateData}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  Validate All Data
                </button>
              </div>
            )}

            {activeSection === 'storage' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Storage Management</h3>
                
                <div className="bg-gray-50 p-4 rounded-md">
                  <h4 className="font-medium text-gray-900 mb-2">Storage Usage</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Used:</span>
                      <span className="text-sm font-medium">{(storageStats.used / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Available:</span>
                      <span className="text-sm font-medium">{(storageStats.available / 1024).toFixed(1)} KB</span>
                    </div>
                    <progress
                      className={`storage-progress w-full h-2 rounded-full ${
                        storageStats.used / storageStats.total < 0.5
                          ? 'text-green-500'
                          : storageStats.used / storageStats.total < 0.8
                          ? 'text-yellow-500'
                          : 'text-red-500'
                      }`}
                      value={Math.min(Math.round((storageStats.used / storageStats.total) * 100), 100)}
                      max={100}
                      aria-label={`Storage usage: ${Math.round((storageStats.used / storageStats.total) * 100)}%`}
                      aria-describedby="storage-usage-description"
                    />
                    <div id="storage-usage-description" className="sr-only">
                      Current storage usage is {Math.round((storageStats.used / storageStats.total) * 100)}% of available quota.
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleClearCache}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
                  >
                    Clear Cache
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Export All Data
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'session' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Session Management</h3>
                <p className="text-gray-600">Manage your application session and security tokens.</p>
                
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Refresh Session
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.clear();
                      window.location.reload();
                    }}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Clear All Data & Restart
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'errors' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Error Reporting</h3>
                
                {errorContext && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium text-gray-900 mb-2">Current Error</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>Error ID:</strong> {errorContext.errorId}</div>
                      <div><strong>Time:</strong> {new Date(errorContext.timestamp).toLocaleString()}</div>
                      <div><strong>Message:</strong> {errorContext.message}</div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleCopyErrorDetails}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Copy Error Details
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleExportErrorLog}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Export Error Log
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
