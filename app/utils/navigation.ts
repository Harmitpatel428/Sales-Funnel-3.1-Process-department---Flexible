/**
 * Navigation utilities with synchronous storage flush
 * 
 * Provides safe navigation functions that ensure critical data is flushed
 * before navigation occurs.
 */

import { flushPendingSyncFor } from './storage';

// Critical keys that must be flushed before navigation
const CRITICAL_KEYS = [
  'leadData',
  'leadPasswordConfig',
  'leadSecurityAnswers',
  'leadHeaderConfig',
  'leadColumnConfig',
  'leadFilterState',
  'leadSortState',
  'leadViewState'
];

/**
 * Flush critical storage data synchronously before navigation
 */
export async function flushCriticalData(): Promise<void> {
  try {
    await flushPendingSyncFor(CRITICAL_KEYS);
  } catch (error) {
    console.error('Failed to flush critical data before navigation:', error);
  }
}

/**
 * Safe navigation function that flushes critical data before navigating
 */
export async function safeNavigate(callback: () => void): Promise<void> {
  await flushCriticalData();
  callback();
}

/**
 * Hook for safe navigation with automatic flush
 */
export function useSafeNavigation() {
  const navigate = (callback: () => void) => {
    safeNavigate(callback);
  };

  const navigateWithDelay = (callback: () => void, delay: number = 100) => {
    setTimeout(() => {
      safeNavigate(callback);
    }, delay);
  };

  return {
    navigate,
    navigateWithDelay,
    flushCriticalData
  };
}

/**
 * Setup navigation protection for the application
 */
export function setupNavigationProtection(): void {
  // Protect against page unload
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    flushCriticalData();
    
    // Optional: Show confirmation dialog for unsaved changes
    // event.preventDefault();
    // event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
  };

  // Protect against page visibility changes (mobile/tab switching)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushCriticalData();
    }
  };

  // Protect against navigation events (if using Next.js router)
  const handleRouteChange = () => {
    flushCriticalData();
  };

  // Add event listeners
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Listen for Next.js router events if available
  if (typeof window !== 'undefined' && (window as any).next) {
    try {
      const router = (window as any).next.router;
      if (router && router.events) {
        router.events.on('routeChangeStart', handleRouteChange);
      }
    } catch (error) {
      console.warn('Failed to setup Next.js router protection:', error);
    }
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    if (typeof window !== 'undefined' && (window as any).next) {
      try {
        const router = (window as any).next.router;
        if (router && router.events) {
          router.events.off('routeChangeStart', handleRouteChange);
        }
      } catch (error) {
        console.warn('Failed to cleanup Next.js router protection:', error);
      }
    }
  };
}

/**
 * Enhanced router hook that automatically flushes critical data
 */
export function useSafeRouter() {
  const flushAndNavigate = (callback: () => void) => {
    flushCriticalData();
    callback();
  };

  const flushAndPush = (url: string) => {
    flushCriticalData();
    // This would be used with Next.js router.push(url)
    // For now, just call the callback
    if (typeof window !== 'undefined' && (window as any).next) {
      try {
        const router = (window as any).next.router;
        if (router && router.push) {
          router.push(url);
        }
      } catch (error) {
        console.warn('Failed to navigate with Next.js router:', error);
      }
    }
  };

  const flushAndReplace = (url: string) => {
    flushCriticalData();
    // This would be used with Next.js router.replace(url)
    if (typeof window !== 'undefined' && (window as any).next) {
      try {
        const router = (window as any).next.router;
        if (router && router.replace) {
          router.replace(url);
        }
      } catch (error) {
        console.warn('Failed to replace with Next.js router:', error);
      }
    }
  };

  return {
    flushAndNavigate,
    flushAndPush,
    flushAndReplace,
    flushCriticalData
  };
}
