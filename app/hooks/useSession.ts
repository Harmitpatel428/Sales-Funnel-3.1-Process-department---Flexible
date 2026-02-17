import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { UserSession } from '../types/processTypes';

export enum AuthState {
    INIT = 'INIT',
    CHECKING = 'CHECKING',
    AUTHENTICATED = 'AUTHENTICATED',
    UNAUTHENTICATED = 'UNAUTHENTICATED',
    EXPIRED = 'EXPIRED'
}

export interface SessionState {
    valid: boolean;
    expiresAt: Date | null;
    lastActivityAt: Date | null;
    permissionsHash: string | null;
    user: UserSession | null;
    timeUntilExpiry: number; // milliseconds
    raw: any;
}

const POLL_INTERVAL = 30000; // 30 seconds

const INVALID_SESSION: SessionState = {
    valid: false,
    expiresAt: null,
    lastActivityAt: null,
    permissionsHash: null,
    user: null,
    timeUntilExpiry: 0,
    raw: null
};

async function fetchSession(): Promise<SessionState> {
    try {
        // Single source of truth: /api/auth/me
        // Using redirect: 'manual' prevents the browser from following cached 308 redirects
        const response = await fetch('/api/auth/me', {
            credentials: 'include',
            redirect: 'manual', // Don't follow redirects - treat them as errors
            cache: 'no-store' // Bypass browser cache completely
        });

        // With redirect: 'manual', redirects show as type 'opaqueredirect' or status 0
        if (response.type === 'opaqueredirect' || response.status === 0) {
            console.warn('[Session] Received redirect - treating as invalid session');
            return INVALID_SESSION;
        }

        if (response.status === 401) {
            return INVALID_SESSION;
        }

        if (!response.ok) {
            // Treat server errors as no session (safe fallback)
            return INVALID_SESSION;
        }

        const data = await response.json();

        // Enforce invariant: data must be valid AND have a user
        if (data.valid !== true || !data.user) {
            return INVALID_SESSION;
        }

        const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
        const lastActivityAt = data.lastActivityAt ? new Date(data.lastActivityAt) : null;
        const timeUntilExpiry = expiresAt ? expiresAt.getTime() - Date.now() : 0;

        return {
            valid: true,
            expiresAt,
            lastActivityAt,
            permissionsHash: data.permissionsHash,
            user: data.user,
            timeUntilExpiry,
            raw: data
        };
    } catch (e) {
        // Network or parsing errors MUST resolve to invalid session
        console.error("Session check failed (network/parse)", e);
        return INVALID_SESSION;
    }
}

export function useSession() {
    const router = useRouter();
    const pathname = usePathname();
    const [consecutiveFailures, setConsecutiveFailures] = useState(0);
    const previousPermissionsHash = useRef<string | null>(null);

    // Explicit Auth State Machine
    const [authState, setAuthState] = useState<AuthState>(AuthState.INIT);

    // Initial transition INIT -> CHECKING
    useEffect(() => {
        if (authState === AuthState.INIT) {
            setAuthState(AuthState.CHECKING);
        }
    }, [authState]);

    const { data: sessionState, refetch, isLoading, isError } = useQuery({
        queryKey: ['session'],
        queryFn: async () => {
            try {
                const result = await fetchSession();
                setConsecutiveFailures(0);
                return result;
            } catch (e) {
                setConsecutiveFailures(prev => prev + 1);
                throw e;
            }
        },
        refetchInterval: (query) => {
            // Polling logic
            const data = query.state.data as SessionState | undefined;
            // If we have an invalid session, stop polling (logout state)
            if (data && data.valid === false) return false;
            return POLL_INTERVAL;
        },
        retry: false,
        staleTime: 10000,
    });

    // State Machine Transitions & Resolution
    useEffect(() => {
        if (authState === AuthState.INIT) return; // Handled by separate effect

        const currentSession = sessionState || INVALID_SESSION;

        // CHECKING Resolution
        if (authState === AuthState.CHECKING) {
            if (!isLoading) {
                if (currentSession.valid) {
                    setAuthState(AuthState.AUTHENTICATED);
                } else {
                    setAuthState(AuthState.UNAUTHENTICATED);
                }
            }
        }

        // AUTHENTICATED Maintenance
        if (authState === AuthState.AUTHENTICATED) {
            if (currentSession.valid === false) {
                setAuthState(AuthState.UNAUTHENTICATED);
            } else if (currentSession.expiresAt && new Date(currentSession.expiresAt).getTime() < Date.now()) {
                setAuthState(AuthState.EXPIRED);
            }
        }

        // UNAUTHENTICATED & EXPIRED are mostly terminal until login, but if session becomes valid (e.g. via another tab), we could recover?
        // For strict state machine as requested: "UNAUTHENTICATED triggers redirect".
        if (authState === AuthState.UNAUTHENTICATED && currentSession.valid) {
            setAuthState(AuthState.AUTHENTICATED); // Recovery path (e.g. login in another tab)
        }

    }, [authState, isLoading, sessionState]);

    // Handle Redirects (Side Effects)
    useEffect(() => {
        // Only redirect if not on public pages
        // Assuming public pages are /login, /register, etc. 
        // We use a simple check for now strictly for /login to avoid loops.
        const isPublicPage = pathname?.startsWith('/login') || pathname === '/' || pathname?.startsWith('/public') || pathname?.startsWith('/_next');

        if (!isPublicPage) {
            if (authState === AuthState.UNAUTHENTICATED) {
                router.push('/login');
            } else if (authState === AuthState.EXPIRED) {
                // Clear session state logic is implicit as we redirect
                router.push('/login?reason=expired');
            }
        }
    }, [authState, pathname, router]);


    // Handle side effects of session state changes (Legacy & Notifications)
    useEffect(() => {
        if (!sessionState) return;

        // 2. Detect permission changes
        if (sessionState.permissionsHash && previousPermissionsHash.current && sessionState.permissionsHash !== previousPermissionsHash.current) {
            window.dispatchEvent(new CustomEvent('permission-changed', {
                detail: { oldHash: previousPermissionsHash.current, newHash: sessionState.permissionsHash }
            }));
        }

        if (sessionState.permissionsHash) {
            previousPermissionsHash.current = sessionState.permissionsHash;
        }

        // 3. Detect account lock (if user data is present but locked)
        if (sessionState.user?.lockedUntil && new Date(sessionState.user.lockedUntil) > new Date()) {
            window.dispatchEvent(new CustomEvent('account-locked', {
                detail: { lockedUntil: sessionState.user.lockedUntil }
            }));
        }

    }, [sessionState, consecutiveFailures]);

    const refreshSession = useCallback(async () => {
        try {
            await fetch('/api/auth/session/refresh', { method: 'POST' });
            const res = await refetch();
            // Manually re-trigger auth state check if needed?
            // The useEffect observing sessionState will handle it.
            return true;
        } catch (e) {
            console.error("Failed to refresh session", e);
            return false;
        }
    }, [refetch]);

    return {
        authState, // PROMOTED: New Explicit State
        sessionState: sessionState || INVALID_SESSION,
        isLoading: authState === AuthState.INIT || authState === AuthState.CHECKING, // Derived loading state
        isError,
        refreshSession,
        refetch,
        consecutiveFailures
    };
}
