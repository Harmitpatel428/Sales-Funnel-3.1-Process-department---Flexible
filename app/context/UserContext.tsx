'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { User, UserRole } from '../types/processTypes';
import { loginAction, logoutAction, getCurrentUser } from '../actions/auth';
import { getUsers, createUserAction, updateUserAction, deleteUserAction, resetUserPasswordAction } from '../actions/user';

// ============================================================================
// TYPES
// ============================================================================

export interface UserSession {
    userId: string;
    username: string;
    name: string;
    email: string;
    role: UserRole;
    loginAt?: string;
}

export interface UserContextType {
    currentUser: UserSession | null;
    users: User[];
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    refreshUsers: () => Promise<void>;

    // User management (for admin)
    createUser: (userData: Omit<User, 'userId' | 'createdAt'>) => Promise<{ success: boolean; message: string }>;
    updateUser: (userId: string, updates: Partial<User>) => Promise<{ success: boolean; message: string }>;
    deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
    resetUserPassword: (userId: string) => Promise<{ success: boolean; message: string; newPassword?: string }>;

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
                setCurrentUser({
                    userId: user.userId,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    role: user.role as UserRole,
                });
            } else {
                setCurrentUser(null);
            }
        } catch (error) {
            console.error('Failed to fetch current user:', error);
            setCurrentUser(null);
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
            })));
        } catch (error) {
            // User may not be admin, that's fine
            console.debug('Could not fetch users (may not be admin):', error);
            setUsers([]);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            await refreshUser();
            await refreshUsers();
            setIsLoading(false);
        };
        init();
    }, [refreshUser, refreshUsers]);

    // ============================================================================
    // AUTH OPERATIONS
    // ============================================================================

    const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await loginAction(username, password);

            if (result.success && result.user) {
                setCurrentUser({
                    userId: result.user.userId,
                    username: result.user.username,
                    name: result.user.name,
                    email: result.user.email,
                    role: result.user.role as UserRole,
                    loginAt: new Date().toISOString(),
                });
                // Refresh users list after login (if admin)
                await refreshUsers();
            }

            return { success: result.success, message: result.message };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'Login failed. Please try again.' };
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
    // CONTEXT VALUE
    // ============================================================================

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
