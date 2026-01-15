import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface UserSessionData {
    id: string;
    role: string;
    isActive: boolean;
    lockedUntil: string | null;
    mfaEnabled: boolean;
}

export interface SessionState {
    valid: boolean;
    expiresAt: Date | null;
    lastActivityAt: Date | null;
    permissionsHash: string | null;
    user: UserSessionData | null;
    timeUntilExpiry: number; // milliseconds
}

const POLL_INTERVAL = 30000; // 30 seconds

async function fetchSession(): Promise<SessionState & { raw: any }> {
    const response = await fetch('/api/auth/session');
    if (response.status === 401) {
        return {
            valid: false,
            expiresAt: null,
            lastActivityAt: null,
            permissionsHash: null,
            user: null,
            timeUntilExpiry: 0,
            raw: null
        };
    }

    if (!response.ok) {
        throw new Error('Failed to fetch session');
    }

    const data = await response.json();

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    const lastActivityAt = data.lastActivityAt ? new Date(data.lastActivityAt) : null;
    const timeUntilExpiry = expiresAt ? expiresAt.getTime() - Date.now() : 0;

    return {
        valid: data.valid,
        expiresAt,
        lastActivityAt,
        permissionsHash: data.permissionsHash,
        user: data.user,
        timeUntilExpiry,
        raw: data
    };
}

export function useSession() {
    const [consecutiveFailures, setConsecutiveFailures] = useState(0);
    const previousPermissionsHash = useRef<string | null>(null);

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
            // Stop polling if we have too many failures
            if (consecutiveFailures >= 3) return false;

            // Comment 1: Stop polling if session is explicitly invalid (user should be logged out)
            const data = query.state.data as SessionState | undefined;
            if (data && data.valid === false) return false;

            return POLL_INTERVAL;
        },
        retry: false,
        staleTime: 10000, // Consider data stale after 10s
    });

    // Handle side effects of session state changes
    useEffect(() => {
        if (!sessionState) return;

        // 1. Detect invalid session
        // Note: Logout is now handled by consuming context/component based on sessionState.valid

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
            await refetch();
            return true;
        } catch (e) {
            console.error("Failed to refresh session", e);
            return false;
        }
    }, [refetch]);

    return {
        sessionState: sessionState || {
            valid: false,
            expiresAt: null,
            lastActivityAt: null,
            permissionsHash: null,
            user: null,
            timeUntilExpiry: 0
        },
        isLoading,
        isError,
        refreshSession,
        refetch, // Expose refetch for manual restart (e.g. after login)
        consecutiveFailures
    };
}
