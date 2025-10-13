'use client';

import React, { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { restoreFromBackup, hasBackup } from '../utils/storage';
import { storageNotifications } from '../utils/storageNotifications';

interface PageErrorBoundaryProps {
  children: ReactNode;
  pageName: string;
  onReset?: () => void;
  showBackupRestore?: boolean;
}

export default function PageErrorBoundary({ 
  children, 
  pageName, 
  onReset, 
  showBackupRestore = false 
}: PageErrorBoundaryProps) {
  
  const handlePageError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log page-specific error context
    console.error(`Error in ${pageName} page:`, error);
    console.error('Error Info:', errorInfo);
  };

  const handleRestoreBackup = async () => {
    try {
      const backupKeys = ['leads', 'columns', 'settings'];
      let restoredCount = 0;
      
      for (const key of backupKeys) {
        if (await hasBackup(key)) {
          const result = await restoreFromBackup(key);
          if (result.success) {
            restoredCount++;
          }
        }
      }
      
      if (restoredCount > 0) {
        storageNotifications.notify(`Successfully restored ${restoredCount} backup(s). Page will reload.`, 'success');
        
        // Reload page after successful restore
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        storageNotifications.notify('No backups available to restore.', 'warning');
      }
    } catch (error) {
      storageNotifications.notify('Failed to restore from backup. Please try again.', 'error');
      console.error('Backup restore failed:', error);
    }
  };

  const handleClearData = () => {
    if (confirm(`This will clear all ${pageName.toLowerCase()} data. Are you sure?`)) {
      try {
        // Clear page-specific localStorage keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('leads') || key.includes('columns') || key.includes('settings'))) {
            keysToRemove.push(key);
          }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        storageNotifications.notify(`${pageName} data cleared successfully. Page will reload.`, 'success');
        
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (error) {
        storageNotifications.notify('Failed to clear data. Please try again.', 'error');
        console.error('Clear data failed:', error);
      }
    }
  };

  const handleTryAgain = () => {
    if (onReset) {
      onReset();
    } else {
      window.location.reload();
    }
  };

  const pageErrorFallback = (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">
              Error loading {pageName}
            </h3>
            <p className="text-sm text-gray-500">
              An error occurred while loading this page
            </p>
          </div>
        </div>

        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            This error occurred at {new Date().toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col space-y-2">
          <button
            onClick={handleTryAgain}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          
          {showBackupRestore && (
            <button
              onClick={handleRestoreBackup}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
            >
              Restore from Backup
            </button>
          )}
          
          <button
            onClick={handleClearData}
            className="w-full bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors"
          >
            Clear Page Data
          </button>
          
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          If this problem persists, try restoring from backup or clearing the page data.
        </div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary
      level="page"
      onError={handlePageError}
      fallback={pageErrorFallback}
    >
      {children}
    </ErrorBoundary>
  );
}
