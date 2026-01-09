// Session Configuration
import { debugLogger, DebugCategory } from './debugLogger';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_WARNING_MS = 5 * 60 * 1000; // 5 minutes before timeout
const SESSION_STORAGE_KEY = '_app_session';
const LAST_ACTIVITY_KEY = '_last_activity';
const SESSION_ID_KEY = 'userSessionId';

// Session Data Interface
interface SessionData {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  verifiedOperations: Record<string, boolean>; // Track which operations are unlocked
}

// Session expiry callbacks
const sessionExpiryCallbacks = new Set<() => void>();
let sessionCheckInterval: NodeJS.Timeout | null = null;
let activityTrackingSetup = false;

/**
 * Generate a cryptographically secure session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `session_${timestamp}_${random}`;
}

/**
 * Get current session ID
 */
export function getSessionId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(SESSION_ID_KEY);
}

/**
 * Set current session ID
 */
export function setSessionId(id: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_ID_KEY, id);
}

/**
 * Clear current session ID
 */
export function clearSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SESSION_ID_KEY);
}

/**
 * Get session duration in minutes
 * @param loginTime ISO timestamp of login
 */
export function getSessionDuration(loginTime: string): number {
  if (!loginTime) return 0;
  const start = new Date(loginTime).getTime();
  const end = Date.now();
  return Math.round((end - start) / 60000); // Duration in minutes
}

/**
 * Start a new session
 * @returns Session ID
 */
export function startSession(): string {
  const sessionId = generateSessionId();
  const now = Date.now();

  const sessionData: SessionData = {
    sessionId,
    createdAt: now,
    expiresAt: now + SESSION_TIMEOUT_MS,
    lastActivity: now,
    verifiedOperations: {}
  };

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    setupSessionCheckInterval();
    return sessionId;
  } catch (error) {
    console.error('Failed to start session:', error);
    throw new Error('Failed to initialize session');
  }
}

/**
 * Get current session data
 * @returns Session data or null if not found
 */
export function getSession(): SessionData | null {
  try {
    const sessionData = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionData) {
      return null;
    }

    return JSON.parse(sessionData) as SessionData;
  } catch (error) {
    debugLogger.error(DebugCategory.GENERAL, 'Failed to parse session data. Session will be invalidated.', {
      error: error instanceof Error ? error.message : String(error)
    });

    // Clear corrupted session data
    invalidateSession();
    return null;
  }
}

/**
 * Check if current session is valid
 * @returns True if session is valid and not expired
 */
export function isSessionValid(): boolean {
  const session = getSession();
  if (!session) {
    return false;
  }

  const now = Date.now();

  // Check if session has expired
  if (now >= session.expiresAt) {
    return false;
  }

  // Check if last activity is within timeout window
  if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
    return false;
  }

  return true;
}

/**
 * Update session activity timestamp
 */
export function updateSessionActivity(): void {
  const session = getSession();
  if (!session) {
    return;
  }

  const now = Date.now();
  session.lastActivity = now;
  session.expiresAt = now + SESSION_TIMEOUT_MS;

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to update session activity:', error);
  }
}

/**
 * Invalidate current session
 */
export function invalidateSession(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);

    // Clear all verified operations
    const session = getSession();
    if (session) {
      session.verifiedOperations = {};
    }

    // Call all registered expiry callbacks
    sessionExpiryCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in session expiry callback:', error);
      }
    });

    // Clear session check interval
    if (sessionCheckInterval) {
      clearInterval(sessionCheckInterval);
      sessionCheckInterval = null;
    }
  } catch (error) {
    console.error('Failed to invalidate session:', error);
  }
}

/**
 * Verify an operation for the current session
 * @param operation - Operation name to verify
 */
export function verifyOperation(operation: string): void {
  const session = getSession();
  if (!session) {
    return;
  }

  session.verifiedOperations[operation] = true;
  updateSessionActivity();

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to verify operation:', error);
  }
}

/**
 * Check if an operation is verified for current session
 * @param operation - Operation name to check
 * @returns True if operation is verified
 */
export function isOperationVerified(operation: string): boolean {
  const session = getSession();
  if (!session || !isSessionValid()) {
    return false;
  }

  return session.verifiedOperations[operation] === true;
}

/**
 * Clear verification for a specific operation
 * @param operation - Operation name to clear
 */
export function clearOperationVerification(operation: string): void {
  const session = getSession();
  if (!session) {
    return;
  }

  delete session.verifiedOperations[operation];

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to clear operation verification:', error);
  }
}

/**
 * Get time until session expires in milliseconds
 * @returns Milliseconds until expiry, or 0 if session invalid
 */
export function getTimeUntilExpiry(): number {
  const session = getSession();
  if (!session || !isSessionValid()) {
    return 0;
  }

  const now = Date.now();
  return Math.max(0, session.expiresAt - now);
}

/**
 * Register a callback to be called when session expires
 * @param callback - Function to call on session expiry
 * @returns Unregister function
 */
export function registerSessionExpiryCallback(callback: () => void): () => void {
  sessionExpiryCallbacks.add(callback);

  return () => {
    sessionExpiryCallbacks.delete(callback);
  };
}

/**
 * Setup automatic session check interval
 */
function setupSessionCheckInterval(): void {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }

  sessionCheckInterval = setInterval(() => {
    if (!isSessionValid()) {
      invalidateSession();
    }
  }, 60000); // Check every 60 seconds
}

/**
 * Setup activity tracking to extend session on user interaction
 * @returns Cleanup function
 */
export function setupActivityTracking(): () => void {
  if (activityTrackingSetup) {
    return () => { }; // Already setup
  }

  let lastActivityUpdate = 0;
  const ACTIVITY_UPDATE_THROTTLE = 30000; // Max once per 30 seconds

  const handleActivity = () => {
    const now = Date.now();
    if (now - lastActivityUpdate > ACTIVITY_UPDATE_THROTTLE) {
      updateSessionActivity();
      lastActivityUpdate = now;
    }
  };

  // Listen to various user interaction events
  const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];

  events.forEach(event => {
    document.addEventListener(event, handleActivity, { passive: true });
  });

  activityTrackingSetup = true;

  return () => {
    events.forEach(event => {
      document.removeEventListener(event, handleActivity);
    });
    activityTrackingSetup = false;
  };
}

/**
 * Setup session warning system
 * @param warningCallback - Function to call when session is about to expire
 * @returns Cleanup function
 */
export function setupSessionWarning(warningCallback: (minutesLeft: number) => void): () => void {
  let warningInterval: NodeJS.Timeout | null = null;

  const checkWarning = () => {
    const timeUntilExpiry = getTimeUntilExpiry();
    const minutesLeft = Math.ceil(timeUntilExpiry / (60 * 1000));

    if (timeUntilExpiry > 0 && timeUntilExpiry <= SESSION_WARNING_MS) {
      warningCallback(minutesLeft);
    }
  };

  warningInterval = setInterval(checkWarning, 60000); // Check every 60 seconds

  return () => {
    if (warningInterval) {
      clearInterval(warningInterval);
      warningInterval = null;
    }
  };
}

/**
 * Get session statistics for debugging
 */
export function getSessionStats(): {
  isValid: boolean;
  sessionId: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  lastActivity: number | null;
  timeUntilExpiry: number;
  verifiedOperations: string[];
} {
  const session = getSession();

  return {
    isValid: isSessionValid(),
    sessionId: session?.sessionId || null,
    createdAt: session?.createdAt || null,
    expiresAt: session?.expiresAt || null,
    lastActivity: session?.lastActivity || null,
    timeUntilExpiry: getTimeUntilExpiry(),
    verifiedOperations: session ? Object.keys(session.verifiedOperations) : []
  };
}
