'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
    User,
    UserSession,
    UserRole,
    UserContextType
} from '../types/processTypes';
import { addAuditLog } from '../utils/storage';
import { generateSessionId, getSessionId, setSessionId, clearSession, getSessionDuration } from '../utils/session';

// ============================================================================
// CONSTANTS
// ============================================================================

const USERS_STORAGE_KEY = 'processUsers';
const CURRENT_USER_STORAGE_KEY = 'currentUserSession';
const SESSION_ID_KEY = 'userSessionId';

// Simple hash function for password storage (not cryptographically secure, but works offline)
function hashPassword(password: string): string {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'hashed_' + Math.abs(hash).toString(16);
}

// Generate UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Generate secure random password (12+ chars, mixed case, numbers, symbols)
function generateSecurePassword(): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    const allChars = lowercase + uppercase + numbers + symbols;

    // Ensure at least one of each type
    let password = '';
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill remaining 8 characters randomly
    for (let i = 0; i < 8; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

// ============================================================================
// DEFAULT ADMIN USER
// ============================================================================

const DEFAULT_ADMIN: User = {
    userId: 'admin-001',
    username: 'admin',
    name: 'Administrator',
    email: 'admin@company.com',
    role: 'ADMIN',
    password: hashPassword('admin123'),
    plainPassword: 'admin123', // Plain password for Admin visibility
    isActive: true,
    createdAt: new Date().toISOString()
};

// ============================================================================
// CONTEXT
// ============================================================================

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const [users, setUsers] = useState<User[]>([]);
    const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isHydrated, setIsHydrated] = useState(false);

    // Load users and session from localStorage
    useEffect(() => {
        try {
            // Load users
            const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
            if (storedUsers) {
                const parsedUsers = JSON.parse(storedUsers);
                // Migrate existing SALES users to SALES_EXECUTIVE
                const migratedUsers = parsedUsers.map((u: User) =>
                    u.role === 'SALES' as any ? { ...u, role: 'SALES_EXECUTIVE' } : u
                );
                setUsers(migratedUsers);
            } else {
                // First time: create default admin user
                const initialUsers = [DEFAULT_ADMIN];
                localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initialUsers));
                setUsers(initialUsers);
            }

            // Load current session
            const storedSession = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
            if (storedSession) {
                const session = JSON.parse(storedSession);
                // Migrate legacy SALES session role to SALES_EXECUTIVE
                if (session.role === 'SALES') {
                    session.role = 'SALES_EXECUTIVE';
                    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(session));
                }
                setCurrentUser(session);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            // Initialize with default admin on error
            setUsers([DEFAULT_ADMIN]);
        } finally {
            setIsLoading(false);
            setIsHydrated(true);
        }
    }, []);

    // SECURITY NOTE: Plain passwords are persisted for Admin visibility in offline desktop app
    // Persist users to localStorage (including plainPassword for Admin access)
    useEffect(() => {
        if (!isHydrated) return;

        const timeoutId = setTimeout(() => {
            try {
                // Persist users with plainPassword for Admin visibility
                const usersToSave = users;
                localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersToSave));
            } catch (error) {
                console.error('Error saving users:', error);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [users, isHydrated]);

    // ============================================================================
    // AUTH OPERATIONS
    // ============================================================================

    const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        const now = new Date().toISOString();
        const deviceInfo = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

        if (!user) {
            // Log failed login attempt
            try {
                addAuditLog({
                    id: generateUUID(),
                    actionType: 'USER_LOGIN_FAILED',
                    entityType: 'user',
                    entityId: 'unknown',
                    performedBy: 'unknown',
                    performedByName: username,
                    performedAt: now,
                    description: `Failed login attempt for username "${username}" - User not found`,
                    deviceInfo,
                    metadata: { reason: 'user_not_found', attemptedUsername: username }
                });
            } catch (e) { console.error('Audit log error:', e); }
            return { success: false, message: 'User not found' };
        }

        if (!user.isActive) {
            // Log failed login attempt
            try {
                addAuditLog({
                    id: generateUUID(),
                    actionType: 'USER_LOGIN_FAILED',
                    entityType: 'user',
                    entityId: user.userId,
                    performedBy: user.userId,
                    performedByName: user.name,
                    performedAt: now,
                    description: `Failed login attempt for "${user.name}" - Account deactivated`,
                    deviceInfo,
                    metadata: { reason: 'account_deactivated' }
                });
            } catch (e) { console.error('Audit log error:', e); }
            return { success: false, message: 'User account is deactivated' };
        }

        const hashedInput = hashPassword(password);
        if (user.password !== hashedInput) {
            // Log failed login attempt
            try {
                addAuditLog({
                    id: generateUUID(),
                    actionType: 'USER_LOGIN_FAILED',
                    entityType: 'user',
                    entityId: user.userId,
                    performedBy: user.userId,
                    performedByName: user.name,
                    performedAt: now,
                    description: `Failed login attempt for "${user.name}" - Invalid password`,
                    deviceInfo,
                    metadata: { reason: 'invalid_password' }
                });
            } catch (e) { console.error('Audit log error:', e); }
            return { success: false, message: 'Invalid password' };
        }

        // Generate session ID for tracking
        const sessionId = generateSessionId();
        setSessionId(sessionId);

        // Create session
        const session: UserSession = {
            userId: user.userId,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            loginAt: now
        };

        // Update last login and capture plainPassword in-memory for this user
        setUsers(prev => prev.map(u =>
            u.userId === user.userId
                ? { ...u, lastLoginAt: now, plainPassword: password }
                : u
        ));

        // Store session
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(session));
        setCurrentUser(session);

        // Log successful login
        try {
            addAuditLog({
                id: generateUUID(),
                actionType: 'USER_LOGIN',
                entityType: 'user',
                entityId: user.userId,
                performedBy: user.userId,
                performedByName: user.name,
                performedAt: now,
                description: `User "${user.name}" logged in successfully`,
                deviceInfo,
                sessionId,
                metadata: { role: user.role, loginMethod: 'password' }
            });
        } catch (e) { console.error('Audit log error:', e); }

        return { success: true, message: 'Login successful' };
    }, [users]);

    const logout = useCallback(() => {
        const now = new Date().toISOString();
        const deviceInfo = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
        const sessionId = sessionStorage.getItem(SESSION_ID_KEY) || undefined;

        // Log logout before clearing session
        if (currentUser) {
            try {
                addAuditLog({
                    id: generateUUID(),
                    actionType: 'USER_LOGOUT',
                    entityType: 'user',
                    entityId: currentUser.userId,
                    performedBy: currentUser.userId,
                    performedByName: currentUser.name,
                    performedAt: now,
                    description: `User "${currentUser.name}" logged out. Session duration: ${getSessionDuration(currentUser.loginAt)} minutes`,
                    deviceInfo,
                    sessionId: getSessionId() || undefined,
                    metadata: {
                        role: currentUser.role,
                        durationMinutes: getSessionDuration(currentUser.loginAt)
                    }
                });
            } catch (e) { console.error('Audit log error:', e); }
        }

        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
        clearSession();
        // Security: Clear any active impersonation session to prevent privilege carryover
        sessionStorage.removeItem('impersonationSession');
        setCurrentUser(null);
    }, [currentUser]);

    // ============================================================================
    // USER CRUD OPERATIONS
    // ============================================================================

    const createUser = useCallback((userData: Omit<User, 'userId' | 'createdAt'>): { success: boolean; message: string } => {
        // Check if username already exists
        if (users.some(u => u.username.toLowerCase() === userData.username.toLowerCase())) {
            return { success: false, message: 'Username already exists' };
        }

        // Check if email already exists
        if (users.some(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
            return { success: false, message: 'Email already exists' };
        }

        const newUser: User = {
            ...userData,
            userId: generateUUID(),
            password: hashPassword(userData.password),
            plainPassword: userData.password,
            createdAt: new Date().toISOString()
        };

        setUsers(prev => [...prev, newUser]);

        // Audit Log: USER_CREATED
        if (currentUser) {
            try {
                addAuditLog({
                    id: generateUUID(),
                    actionType: 'USER_CREATED',
                    entityType: 'user',
                    entityId: newUser.userId,
                    performedBy: currentUser.userId,
                    performedByName: currentUser.name,
                    performedAt: new Date().toISOString(),
                    description: `User "${newUser.name}" (${newUser.role}) created by ${currentUser.name}`,
                    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                    sessionId: getSessionId() || undefined,
                    afterValue: newUser,
                    metadata: {
                        createdUserRole: newUser.role,
                        createdUserEmail: newUser.email
                    }
                });
            } catch (e) { console.error('Audit log error:', e); }
        }

        return { success: true, message: 'User created successfully' };
    }, [users]);

    const updateUser = useCallback((userId: string, updates: Partial<User>): { success: boolean; message: string } => {
        const userIndex = users.findIndex(u => u.userId === userId);
        if (userIndex === -1) {
            return { success: false, message: 'User not found' };
        }

        // If updating username, check for duplicates
        if (updates.username) {
            const duplicate = users.find(u =>
                u.userId !== userId &&
                u.username.toLowerCase() === updates.username!.toLowerCase()
            );
            if (duplicate) {
                return { success: false, message: 'Username already exists' };
            }
        }

        // If updating password, hash it and store plain
        if (updates.password) {
            updates.plainPassword = updates.password;
            updates.password = hashPassword(updates.password);
        }

        setUsers(prev => prev.map(u =>
            u.userId === userId ? { ...u, ...updates } : u
        ));

        // Audit Log: USER_UPDATED (and ACTIVATED/DEACTIVATED)
        if (currentUser) {
            const oldUser = users.find(u => u.userId === userId);
            if (oldUser) {
                const newUser = { ...oldUser, ...updates };
                const now = new Date().toISOString();

                // Determine specific action type if status changed
                let actionType: any = 'USER_UPDATED';
                let description = `User "${newUser.name}" updated by ${currentUser.name}`;

                if (updates.isActive !== undefined && updates.isActive !== oldUser.isActive) {
                    actionType = updates.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
                    description = `User "${newUser.name}" ${updates.isActive ? 'activated' : 'deactivated'} by ${currentUser.name}`;
                }

                // Calculate summary of changes
                const changes: string[] = [];
                Object.keys(updates).forEach(key => {
                    if (key === 'updatedAt' || key === 'password' || key === 'plainPassword') return;
                    // @ts-ignore
                    if (JSON.stringify(oldUser[key]) !== JSON.stringify(updates[key])) {
                        // @ts-ignore
                        changes.push(`${key}: ${oldUser[key]} -> ${updates[key]}`);
                    }
                });

                if (updates.password) {
                    changes.push('Password changed');
                }

                try {
                    addAuditLog({
                        id: generateUUID(),
                        actionType: actionType,
                        entityType: 'user',
                        entityId: userId,
                        performedBy: currentUser.userId,
                        performedByName: currentUser.name,
                        performedAt: now,
                        description,
                        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                        sessionId: getSessionId() || undefined,
                        beforeValue: oldUser,
                        afterValue: newUser,
                        changesSummary: changes.join(', '),
                        metadata: {
                            updates: Object.keys(updates)
                        }
                    });
                } catch (e) { console.error('Audit log error:', e); }
            }
        }

        return { success: true, message: 'User updated successfully' };
    }, [users]);

    const deleteUser = useCallback((userId: string): { success: boolean; message: string } => {
        // Prevent deleting the default admin
        if (userId === 'admin-001') {
            return { success: false, message: 'Cannot delete the default admin user' };
        }

        // Prevent deleting yourself
        if (currentUser?.userId === userId) {
            return { success: false, message: 'Cannot delete your own account' };
        }

        // Capture user data before deletion for audit
        const userToDelete = users.find(u => u.userId === userId);

        setUsers(prev => prev.filter(u => u.userId !== userId));

        // Audit Log: USER_DELETED
        if (currentUser && userToDelete) {
            try {
                addAuditLog({
                    id: generateUUID(),
                    actionType: 'USER_DELETED',
                    entityType: 'user',
                    entityId: userId,
                    performedBy: currentUser.userId,
                    performedByName: currentUser.name,
                    performedAt: new Date().toISOString(),
                    description: `User "${userToDelete.name}" deleted by ${currentUser.name}`,
                    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                    sessionId: getSessionId() || undefined,
                    beforeValue: userToDelete,
                    metadata: {
                        deletedUserRole: userToDelete.role,
                        deletedUserEmail: userToDelete.email
                    }
                });
            } catch (e) { console.error('Audit log error:', e); }
        }

        return { success: true, message: 'User deleted successfully' };
    }, [currentUser]);

    const resetUserPassword = useCallback((userId: string): { success: boolean; newPassword?: string; message: string } => {
        // RBAC: Only ADMIN can reset passwords
        if (!currentUser || currentUser.role !== 'ADMIN') {
            return { success: false, message: 'Unauthorized: Only admins can reset passwords' };
        }

        // Prevent resetting own password through this method
        if (currentUser.userId === userId) {
            return { success: false, message: 'Cannot reset your own password. Use profile settings instead.' };
        }

        const user = users.find(u => u.userId === userId);
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        // Generate new secure password
        const newPassword = generateSecurePassword();
        const hashedPassword = hashPassword(newPassword);
        const now = new Date().toISOString();
        const deviceInfo = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

        // Update user with new password (plainPassword in-memory only)
        setUsers(prev => prev.map(u =>
            u.userId === userId
                ? {
                    ...u,
                    password: hashedPassword,
                    plainPassword: newPassword,
                    lastResetAt: now,
                    passwordHistory: [
                        ...(u.passwordHistory || []),
                        {
                            timestamp: now,
                            oldPassword: u.plainPassword || 'unknown',
                            newPassword: newPassword,
                            changedBy: currentUser.userId,
                            changedByName: currentUser.name,
                            type: 'ADMIN_RESET' as const
                        }
                    ]
                }
                : u
        ));

        // Log password reset to audit
        try {
            addAuditLog({
                id: generateUUID(),
                actionType: 'USER_PASSWORD_RESET_BY_ADMIN',
                entityType: 'user',
                entityId: userId,
                performedBy: currentUser.userId,
                performedByName: currentUser.name,
                performedAt: now,
                description: `Admin "${currentUser.name}" reset password for user "${user.name}"`,
                deviceInfo,
                sessionId: getSessionId() || undefined,
                changesSummary: `Password reset for ${user.username}`,
                metadata: {
                    targetUserId: userId,
                    targetUserName: user.name,
                    targetUserRole: user.role
                }
            });
        } catch (e) { console.error('Audit log error:', e); }

        return { success: true, newPassword, message: 'Password reset successfully' };
    }, [currentUser, users]);

    // Validate password strength
    const validatePasswordStrength = useCallback((password: string): { valid: boolean; message: string } => {
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters long' };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }
        if (!/[0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }
        if (!/[!@#$%^&*]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one special character (!@#$%^&*)' };
        }
        return { valid: true, message: 'Password meets requirements' };
    }, []);

    const changeOwnPassword = useCallback((currentPassword: string, newPassword: string): { success: boolean; message: string } => {
        // Must be logged in
        if (!currentUser) {
            return { success: false, message: 'You must be logged in to change your password' };
        }

        // Find current user
        const user = users.find(u => u.userId === currentUser.userId);
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        // Verify current password
        const hashedCurrentPassword = hashPassword(currentPassword);
        if (user.password !== hashedCurrentPassword) {
            return { success: false, message: 'Current password is incorrect' };
        }

        // Validate new password strength
        const strengthCheck = validatePasswordStrength(newPassword);
        if (!strengthCheck.valid) {
            return { success: false, message: strengthCheck.message };
        }

        // Hash new password
        const hashedNewPassword = hashPassword(newPassword);
        const now = new Date().toISOString();

        // Update user with new password
        setUsers(prev => prev.map(u =>
            u.userId === currentUser.userId
                ? {
                    ...u,
                    password: hashedNewPassword,
                    plainPassword: newPassword,
                    lastResetAt: now,
                    passwordHistory: [
                        ...(u.passwordHistory || []),
                        {
                            timestamp: now,
                            oldPassword: user.plainPassword || 'unknown',
                            newPassword: newPassword,
                            changedBy: currentUser.userId,
                            changedByName: 'Self',
                            type: 'SELF' as const
                        }
                    ]
                }
                : u
        ));

        // Log password change to audit
        try {
            // No require needed, already imported
            addAuditLog({
                id: generateUUID(),
                actionType: 'USER_PASSWORD_CHANGED',
                entityType: 'user',
                entityId: currentUser.userId,
                performedBy: currentUser.userId,
                performedByName: currentUser.name,
                performedAt: now,
                description: 'User changed their own password',
                deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                sessionId: getSessionId() || undefined,
                changesSummary: 'User changed own password',
                beforeValue: { password: '***', plainPassword: currentPassword },
                afterValue: { password: '***', plainPassword: newPassword },
                metadata: {
                    changeType: 'SELF',
                    timestamp: now,
                    userRole: currentUser.role
                }
            });
        } catch (error) {
            console.error('Error logging password change:', error);
        }

        return { success: true, message: 'Password changed successfully' };
    }, [currentUser, users, validatePasswordStrength]);

    const getUserById = useCallback((userId: string): User | undefined => {
        return users.find(u => u.userId === userId);
    }, [users]);

    const getUsersByRole = useCallback((role: UserRole): User[] => {
        return users.filter(u => u.role === role && u.isActive);
    }, [users]);

    // ============================================================================
    // PERMISSION CHECKS
    // ============================================================================

    const hasRole = useCallback((roles: UserRole[]): boolean => {
        if (!currentUser) return false;
        return roles.includes(currentUser.role);
    }, [currentUser]);

    const canManageLeads = useCallback((): boolean => {
        return hasRole(['SALES_EXECUTIVE', 'SALES_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canConvertToCase = useCallback((): boolean => {
        return hasRole(['SALES_EXECUTIVE', 'SALES_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canManageCases = useCallback((): boolean => {
        return hasRole(['PROCESS_EXECUTIVE', 'PROCESS_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canViewAllCases = useCallback((): boolean => {
        return hasRole(['PROCESS_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canManageUsers = useCallback((): boolean => {
        return hasRole(['ADMIN']);
    }, [hasRole]);

    const canViewReports = useCallback((): boolean => {
        return hasRole(['PROCESS_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canViewAllLeads = useCallback((): boolean => {
        return hasRole(['SALES_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canAssignLeads = useCallback((): boolean => {
        return hasRole(['SALES_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canReassignLeads = useCallback((): boolean => {
        return hasRole(['SALES_MANAGER', 'ADMIN']);
    }, [hasRole]);

    const canAccessSalesDashboard = useCallback((): boolean => {
        return hasRole(['ADMIN', 'SALES_EXECUTIVE', 'SALES_MANAGER']);
    }, [hasRole]);

    const canAccessProcessDashboard = useCallback((): boolean => {
        return hasRole(['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE']);
    }, [hasRole]);

    const canDeleteLeads = useCallback((): boolean => {
        return hasRole(['ADMIN']);
    }, [hasRole]);

    const canAssignBenefitTypes = useCallback((): boolean => {
        return hasRole(['ADMIN', 'PROCESS_MANAGER']);
    }, [hasRole]);

    // ============================================================================
    // IMPERSONATION SUPPORT
    // ============================================================================

    /**
     * Override the current user session for impersonation.
     * This allows ImpersonationProvider to switch the effective user.
     */
    const overrideCurrentUser = useCallback((user: UserSession | null) => {
        setCurrentUser(user);
        // Note: We don't persist to localStorage here - the session is temporary
        // The ImpersonationProvider handles sessionStorage for persistence
    }, []);

    // ============================================================================
    // CONTEXT VALUE
    // ============================================================================

    const contextValue: UserContextType = {
        currentUser,
        users,
        isAuthenticated: currentUser !== null,
        isLoading,
        login,
        logout,
        createUser,
        updateUser,
        deleteUser,
        resetUserPassword,
        changeOwnPassword,
        getUserById,
        getUsersByRole,
        overrideCurrentUser,
        hasRole,
        canManageLeads,
        canConvertToCase,
        canManageCases,
        canViewAllCases,
        canManageUsers,
        canViewReports,
        canViewAllLeads,
        canAssignLeads,
        canReassignLeads,
        canAccessSalesDashboard,
        canAccessProcessDashboard,
        canDeleteLeads,
        canAssignBenefitTypes
    };

    // Show loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    return (
        <UserContext.Provider value={contextValue}>
            {children}
        </UserContext.Provider>
    );
}

export function useUsers() {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error('useUsers must be used inside UserProvider');
    return ctx;
}
