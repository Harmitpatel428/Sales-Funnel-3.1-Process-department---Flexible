'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSession, UserRole, User } from '../types/processTypes';
import { addAuditLog } from '../utils/storage';
import { getSessionId } from '../utils/session';

// ============================================================================
// TYPES
// ============================================================================

export interface ImpersonationContextType {
    isImpersonating: boolean;
    originalUser: UserSession | null;
    impersonatedUser: UserSession | null;
    startImpersonation: (targetUserId: string) => Promise<{ success: boolean; message: string }>;
    stopImpersonation: () => void;
    canImpersonate: () => boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const IMPERSONATION_SESSION_KEY = 'impersonationSession';

// Generate UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================================
// CONTEXT
// ============================================================================

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

import { useUsers } from './UserContext';

export function ImpersonationProvider({
    children
}: { children: ReactNode }) {
    const { currentUser, users, overrideCurrentUser } = useUsers();
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [originalUser, setOriginalUser] = useState<UserSession | null>(null);
    const [impersonatedUser, setImpersonatedUser] = useState<UserSession | null>(null);
    const [impersonationStartTime, setImpersonationStartTime] = useState<string | null>(null);

    // Load impersonation state from sessionStorage on mount
    useEffect(() => {
        // If we represent that we are already impersonating (state is true), 
        // we short-circuit to avoid re-validating against the *impersonated* currentUser 
        // which would cause the session to be cleared incorrectly.
        if (isImpersonating) return;

        try {
            const savedSession = sessionStorage.getItem(IMPERSONATION_SESSION_KEY);
            if (savedSession) {
                const { originalUser: savedOriginal, impersonatedUser: savedImpersonated, startTime } = JSON.parse(savedSession);

                // VALIDATION: Ensure current user is the original admin
                // This prevents privilege carryover if the browser was closed/reopened or user logged out/in
                if (!currentUser || currentUser.role !== 'ADMIN' || currentUser.userId !== savedOriginal.userId) {
                    sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
                    return;
                }

                if (savedOriginal && savedImpersonated) {
                    setOriginalUser(savedOriginal);
                    setImpersonatedUser(savedImpersonated);
                    setImpersonationStartTime(startTime);
                    setIsImpersonating(true);

                    // Update the current user to the impersonated user
                    // Only do this if we haven't already switched (to avoid infinite loops or double sets)
                    if (currentUser.userId !== savedImpersonated.userId) {
                        overrideCurrentUser(savedImpersonated);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading impersonation session:', error);
            sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
        }
    }, [currentUser, overrideCurrentUser, isImpersonating]);

    const canImpersonate = useCallback((): boolean => {
        // Only admins can impersonate, and cannot impersonate while already impersonating
        if (isImpersonating) return false;
        // Check the original user role if impersonating, otherwise check current user
        const userToCheck = originalUser || currentUser;
        return userToCheck?.role === 'ADMIN';
    }, [currentUser, originalUser, isImpersonating]);

    const startImpersonation = useCallback(async (targetUserId: string): Promise<{ success: boolean; message: string }> => {
        // Get the actual admin user (not the impersonated one)
        const adminUser = originalUser || currentUser;

        // Verify current user is admin
        if (!adminUser || adminUser.role !== 'ADMIN') {
            return { success: false, message: 'Only administrators can impersonate users' };
        }

        // Cannot impersonate if already impersonating
        if (isImpersonating) {
            return { success: false, message: 'Already impersonating a user. Stop current impersonation first.' };
        }

        // Cannot impersonate yourself
        if (targetUserId === adminUser.userId) {
            return { success: false, message: 'Cannot impersonate yourself' };
        }

        // Find target user
        const targetUser = users.find(u => u.userId === targetUserId);
        if (!targetUser) {
            return { success: false, message: 'Target user not found' };
        }

        // Cannot impersonate another admin
        if (targetUser.role === 'ADMIN') {
            return { success: false, message: 'Cannot impersonate another administrator' };
        }

        // Cannot impersonate inactive users
        if (!targetUser.isActive) {
            return { success: false, message: 'Cannot impersonate an inactive user' };
        }

        const now = new Date().toISOString();

        // Create impersonated session
        const impersonatedSession: UserSession = {
            userId: targetUser.userId,
            username: targetUser.username,
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            loginAt: now
        };

        // Store original user (the admin)
        setOriginalUser(adminUser);
        setImpersonatedUser(impersonatedSession);
        setImpersonationStartTime(now);
        setIsImpersonating(true);

        // Update current user to impersonated user - THIS SWITCHES PERMISSIONS
        overrideCurrentUser(impersonatedSession);

        // Save to sessionStorage
        sessionStorage.setItem(IMPERSONATION_SESSION_KEY, JSON.stringify({
            originalUser: adminUser,
            impersonatedUser: impersonatedSession,
            startTime: now
        }));

        // Log impersonation start to audit
        try {
            addAuditLog({
                id: generateUUID(),
                actionType: 'ADMIN_IMPERSONATION_STARTED',
                entityType: 'user',
                entityId: targetUser.userId,
                performedBy: adminUser.userId,
                performedByName: adminUser.name,
                performedAt: now,
                description: `Admin ${adminUser.name} started impersonating ${targetUser.name} (${targetUser.role})`,
                deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                sessionId: getSessionId() || undefined,
                metadata: {
                    originalAdminId: adminUser.userId,
                    originalAdminName: adminUser.name,
                    targetUserId: targetUser.userId,
                    targetUserName: targetUser.name,
                    targetUserRole: targetUser.role,
                    startTime: now
                }
            });
        } catch (error) {
            console.error('Error logging impersonation start:', error);
        }

        return { success: true, message: `Now viewing as ${targetUser.name}` };
    }, [currentUser, originalUser, isImpersonating, users, overrideCurrentUser]);

    const stopImpersonation = useCallback(() => {
        if (!isImpersonating || !originalUser) return;

        const now = new Date().toISOString();

        // Calculate session duration
        let durationMinutes = 0;
        if (impersonationStartTime) {
            const startMs = new Date(impersonationStartTime).getTime();
            const endMs = new Date(now).getTime();
            durationMinutes = Math.round((endMs - startMs) / 60000);
        }

        // Log impersonation end to audit
        try {
            addAuditLog({
                id: generateUUID(),
                actionType: 'ADMIN_IMPERSONATION_ENDED',
                entityType: 'user',
                entityId: impersonatedUser?.userId || '',
                performedBy: originalUser.userId,
                performedByName: originalUser.name,
                performedAt: now,
                description: `Admin ${originalUser.name} stopped impersonating ${impersonatedUser?.name}. Session duration: ${durationMinutes} minutes`,
                deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                sessionId: getSessionId() || undefined,
                metadata: {
                    originalAdminId: originalUser.userId,
                    originalAdminName: originalUser.name,
                    targetUserId: impersonatedUser?.userId,
                    targetUserName: impersonatedUser?.name,
                    targetUserRole: impersonatedUser?.role,
                    startTime: impersonationStartTime,
                    endTime: now,
                    durationMinutes
                }
            });
        } catch (error) {
            console.error('Error logging impersonation end:', error);
        }

        // Restore original user - THIS RESTORES ADMIN PERMISSIONS
        overrideCurrentUser(originalUser);

        // Clear impersonation state
        setIsImpersonating(false);
        setOriginalUser(null);
        setImpersonatedUser(null);
        setImpersonationStartTime(null);

        // Clear sessionStorage
        sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
    }, [isImpersonating, originalUser, impersonatedUser, impersonationStartTime, overrideCurrentUser]);

    // ROBUSTNESS CHECK: Watch currentUser for unexpected changes
    // If we are impersonating but currentUser doesn't match expected impersonated user OR original admin, stop.
    // This handles scenarios where session might be cleared externally or updated inconsistently.
    useEffect(() => {
        if (isImpersonating && currentUser && impersonatedUser && originalUser) {
            if (currentUser.userId !== impersonatedUser.userId && currentUser.userId !== originalUser.userId) {
                stopImpersonation();
            }
        }
    }, [currentUser, isImpersonating, impersonatedUser, originalUser, stopImpersonation]);

    const contextValue: ImpersonationContextType = {
        isImpersonating,
        originalUser,
        impersonatedUser,
        startImpersonation,
        stopImpersonation,
        canImpersonate
    };

    return (
        <ImpersonationContext.Provider value={contextValue}>
            {children}
        </ImpersonationContext.Provider>
    );
}

export function useImpersonation() {
    const ctx = useContext(ImpersonationContext);
    if (!ctx) throw new Error('useImpersonation must be used inside ImpersonationProvider');
    return ctx;
}
