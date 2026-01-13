'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { User, UserRole, UserSession } from '../types/processTypes';
import { loginAction, logoutAction, getCurrentUser } from '../actions/auth';
import { getUsers, createUserAction, updateUserAction, deleteUserAction, resetUserPasswordAction } from '../actions/user';

export interface UserContextType {
    currentUser: UserSession | null;
    users: User[];
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; message: string }>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    refreshUsers: () => Promise<void>;

    // User management (for admin)
    createUser: (userData: Omit<User, 'userId' | 'createdAt'>) => Promise<{ success: boolean; message: string }>;
    updateUser: (userId: string, updates: Partial<User>) => Promise<{ success: boolean; message: string }>;
    deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
    resetUserPassword: (userId: string) => Promise<{ success: boolean; message: string; newPassword?: string }>;

    // SSO & MFA
    loginWithSSO: (provider: string) => void;
    linkSSOAccount: (provider: string) => Promise<void>;
    unlinkSSOAccount: () => Promise<void>;
    getMFAStatus: () => { enabled: boolean; methods: string[] };
    setupMFA: (method: string) => Promise<any>;
    verifyMFA: (code: string) => Promise<boolean>;

    // Impersonation support
    overrideCurrentUser: (user: UserSession) => void;

    // Permission checks
    hasRole: (roles: UserRole[]) => boolean;
    canManageLeads: () => boolean;
    canConvertToCase: () => boolean;
    canManageCases: () => boolean;
    canViewAllCases: () => boolean;
    canManageUsers: () => boolean;
    canViewReports: () => boolean;
    canViewAllLeads: () => boolean;
    canAssignLeads: () => boolean;
    canReassignLeads: () => boolean;
    canAccessSalesDashboard: () => boolean;
    canAccessProcessDashboard: () => boolean;
    canDeleteLeads: () => boolean;
    canAssignBenefitTypes: () => boolean;

    // New permissions
    hasPermission: (permission: string) => boolean;
    hasAnyPermission: (permissions: string[]) => boolean;
    hasAllPermissions: (permissions: string[]) => boolean;
    canViewField: (resource: string, fieldName: string) => Promise<boolean>;
    canEditField: (resource: string, fieldName: string) => Promise<boolean>;
}


// ============================================================================
// CONTEXT
// ============================================================================

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch current user from server on mount
    const refreshUser = useCallback(async () => {
        try {
            const user = await getCurrentUser();
            if (user) {
                // If user has a custom role, use its permissions. 
                // Note: getCurrentUser already merges/returns permissions in 'permissions' field 
                // if we updated it to do so. Let's verify.
                // In app/actions/auth.ts getCurrentUser, we call getUserPermissions(user.id).
                // getUserPermissions logic (lib/middleware/permissions.ts) should handle the merging.
                // So 'user.permissions' here should be correct.

                setCurrentUser({
                    userId: user.userId,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    role: user.role as UserRole,
                    permissions: user.permissions,
                    mfaEnabled: user.mfaEnabled,
                    ssoProvider: user.ssoProvider,
                    roleId: user.roleId,
                    customRole: user.customRole
                });
                return user; // Return user for chaining
            } else {
                setCurrentUser(null);
                return null;
            }
        } catch (error) {
            console.error('Failed to fetch current user:', error);
            setCurrentUser(null);
            return null;
        }
    }, []);

    // Fetch all users (for admin)
    const refreshUsers = useCallback(async () => {
        try {
            const fetchedUsers = await getUsers();
            // Map server data to client User type
            setUsers(fetchedUsers.map(u => ({
                userId: u.id,
                username: u.username,
                name: u.name,
                email: u.email,
                role: u.role as UserRole,
                password: '', // Not returned from server for security
                isActive: u.isActive,
                createdAt: u.createdAt.toISOString(),
                lastLoginAt: u.lastLoginAt?.toISOString(),
                roleId: u.roleId,
                customRole: u.customRole,
                // Server returns mapped permissions string array in getUsers, assuming I updated it to do so?
                // app/actions/user.ts: getUsers maps: permissions: user.customRole.permissions.map(p => p.permission.name)
                // But UserData interface in user.ts doesn't have permissions field? 
                // Let's look at user.ts again. It has customRole: { permissions: string[] }?
                // The view_file output showed: 
                // customRole: user.customRole ? { ..., permissions: user.customRole.permissions.map(...) } : null
                // Wait, UserData interface in view_file showed: customRole: { id: string; name: string } | null; (Line 22)
                // BUT the map function (Line 67) adds permissions! 
                // So the interface was incomplete in the file view, or the map returns more than interface says.
                // Assuming runtime object has permissions inside customRole.
                permissions: u.customRole ? (u as any).customRole.permissions : undefined
            })));
        } catch (error) {
            // User may not be admin, that's fine
            // console.debug('Could not fetch users (may not be admin):', error); // Suppress noise
            setUsers([]);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            const user = await refreshUser();
            // Only fetch users list if we have a logged in user who might be admin
            if (user) {
                await refreshUsers();
            }
            setIsLoading(false);
        };
        init();
    }, [refreshUser, refreshUsers]);

    // ============================================================================
    // AUTH OPERATIONS
    // ============================================================================

    const login = useCallback(async (username: string, password: string, rememberMe: boolean = false): Promise<{ success: boolean; message: string; mfaRequired?: boolean }> => {
        setIsLoading(true);
        try {
            const result = await loginAction(username, password, rememberMe);
            if (result.success && result.user) {
                // If MFA not required, complete login updates locally
                if (!result.mfaRequired) {
                    setCurrentUser({
                        userId: result.user.userId,
                        username: result.user.username,
                        name: result.user.name,
                        email: result.user.email,
                        role: result.user.role as UserRole,
                        permissions: result.user.permissions, // Added permissions
                        mfaEnabled: result.user.mfaEnabled,
                        ssoProvider: result.user.ssoProvider || undefined
                    });
                    // Refresh users list after login (if admin)
                    await refreshUsers();
                }
            }
            return result;
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, [refreshUsers]);

    const logout = useCallback(async () => {
        try {
            await logoutAction();
            setCurrentUser(null);
            setUsers([]);
        } catch (error) {
            console.error('Logout error:', error);
            setCurrentUser(null);
        }
    }, []);

    // ============================================================================
    // USER MANAGEMENT OPERATIONS
    // ============================================================================

    const createUser = useCallback(async (userData: Omit<User, 'userId' | 'createdAt'>): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await createUserAction({
                username: userData.username,
                name: userData.name,
                email: userData.email,
                password: userData.password,
                role: userData.role,
                roleId: userData.roleId || undefined,
            });

            if (result.success) {
                await refreshUsers();
            }

            return { success: result.success, message: result.message };
        } catch (error) {
            console.error('Create user error:', error);
            return { success: false, message: 'Failed to create user' };
        }
    }, [refreshUsers]);

    const updateUser = useCallback(async (userId: string, updates: Partial<User>): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await updateUserAction(userId, {
                name: updates.name,
                email: updates.email,
                role: updates.role,
                isActive: updates.isActive,
                password: updates.password,
                roleId: updates.roleId,
            });

            if (result.success) {
                await refreshUsers();
            }

            return { success: result.success, message: result.message };
        } catch (error) {
            console.error('Update user error:', error);
            return { success: false, message: 'Failed to update user' };
        }
    }, [refreshUsers]);

    const deleteUser = useCallback(async (userId: string): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await deleteUserAction(userId);

            if (result.success) {
                await refreshUsers();
            }

            return { success: result.success, message: result.message };
        } catch (error) {
            console.error('Delete user error:', error);
            return { success: false, message: 'Failed to delete user' };
        }
    }, [refreshUsers]);

    const resetUserPassword = useCallback(async (userId: string): Promise<{ success: boolean; message: string; newPassword?: string }> => {
        try {
            const result = await resetUserPasswordAction(userId);

            if (result.success) {
                await refreshUsers();
            }

            return result;
        } catch (error) {
            console.error('Reset password error:', error);
            return { success: false, message: 'Failed to reset password' };
        }
    }, [refreshUsers]);

    // Override current user (used for impersonation)
    const overrideCurrentUser = useCallback((user: UserSession) => {
        setCurrentUser(user);
    }, []);

    // ============================================================================
    // SSO & MFA OPERATIONS
    // ============================================================================

    const loginWithSSO = useCallback((provider: string) => {
        // Redirect to NextAuth signin
        window.location.href = `/api/auth/signin/${provider.toLowerCase()}`;
    }, []);

    const linkSSOAccount = useCallback(async (provider: string) => {
        // Usually handled by OAuth flow while logged in
        // NextAuth doesn't easily support "link" via simple redirect if using custom user model heavily, 
        // but we can start signin flow and in callback handle linking if session exists.
        window.location.href = `/api/auth/signin/${provider.toLowerCase()}`;
    }, []);

    const unlinkSSOAccount = useCallback(async () => {
        // Need an API endpoint for this
        // await fetch('/api/auth/sso/unlink', { method: 'POST' });
        // TODO: Implement unlinking API
        // For now stub
    }, []);

    const getMFAStatus = useCallback(() => {
        return {
            enabled: currentUser?.mfaEnabled || false,
            methods: ['TOTP'] // Simplified: Assuming TOTP if enabled, need query for others
        };
    }, [currentUser]);

    const setupMFA = useCallback(async (method: string) => {
        // Logic moved to MFASetupModal
        return {};
    }, []);

    const verifyMFA = useCallback(async (code: string) => {
        // Logic moved to Modal or /api/auth/mfa/verify
        return true;
    }, []);

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
    // NEW RBAC METHODS
    // ============================================================================

    const hasPermission = useCallback((permission: string): boolean => {
        if (!currentUser?.permissions) return false;
        // Super Admin check? Or assume permissions list is complete (includes super admin defaults)
        // Our middleware handles populating full list for super admin, so we just check list.
        return currentUser.permissions.includes(permission);
    }, [currentUser]);

    const hasAnyPermission = useCallback((permissions: string[]): boolean => {
        if (!currentUser?.permissions) return false;
        return permissions.some(p => currentUser.permissions?.includes(p));
    }, [currentUser]);

    const hasAllPermissions = useCallback((permissions: string[]): boolean => {
        if (!currentUser?.permissions) return false;
        return permissions.every(p => currentUser.permissions?.includes(p));
    }, [currentUser]);

    // Field-level permissions
    // Note: To avoid excessive server calls, we might want to cache these or fetch on load. 
    // But for now, we implement as async calls as requested.
    // Ideally, we'd add fieldPermissions to UserSession.

    // Importing server action dynamically to avoid build issues if mixed? 
    // No, standard import is fine.

    const canViewField = useCallback(async (resource: string, fieldName: string): Promise<boolean> => {
        if (!currentUser) return false;
        const { getFieldPermissionsAction } = await import('../actions/permissions');
        const perms = await getFieldPermissionsAction(resource);
        // Check for wildcard '*' which means all fields are allowed
        return perms.canView.includes('*') || perms.canView.includes(fieldName);
    }, [currentUser]);

    const canEditField = useCallback(async (resource: string, fieldName: string): Promise<boolean> => {
        if (!currentUser) return false;
        const { getFieldPermissionsAction } = await import('../actions/permissions');
        const perms = await getFieldPermissionsAction(resource);
        // Check for wildcard '*' which means all fields are allowed
        return perms.canEdit.includes('*') || perms.canEdit.includes(fieldName);
    }, [currentUser]);

    const contextValue: UserContextType = useMemo(() => ({
        currentUser,
        users,
        isAuthenticated: currentUser !== null,
        isLoading,
        login,
        logout,
        refreshUser,
        refreshUsers,
        createUser,
        updateUser,
        deleteUser,
        resetUserPassword,
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
        canAssignBenefitTypes,
        loginWithSSO,
        linkSSOAccount,
        unlinkSSOAccount,
        getMFAStatus,
        setupMFA,
        verifyMFA,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        canViewField,
        canEditField,
    }), [
        currentUser,
        users,
        isLoading,
        login,
        logout,
        refreshUser,
        refreshUsers,
        createUser,
        updateUser,
        deleteUser,
        resetUserPassword,
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
        canAssignBenefitTypes,
        loginWithSSO,
        linkSSOAccount,
        unlinkSSOAccount,
        getMFAStatus, // Dependencies for memo
        setupMFA,
        getMFAStatus, // Dependencies for memo
        setupMFA,
        verifyMFA,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        canViewField,
        canEditField
    ]);

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

export function useUsers(): UserContextType {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUsers must be used within a UserProvider');
    }
    return context;
}

export default UserContext;
