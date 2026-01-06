'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
    User,
    UserSession,
    UserRole,
    UserContextType
} from '../types/processTypes';

// ============================================================================
// CONSTANTS
// ============================================================================

const USERS_STORAGE_KEY = 'processUsers';
const CURRENT_USER_STORAGE_KEY = 'currentUserSession';

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

    // Persist users to localStorage
    useEffect(() => {
        if (!isHydrated) return;

        const timeoutId = setTimeout(() => {
            try {
                localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
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

        if (!user) {
            return { success: false, message: 'User not found' };
        }

        if (!user.isActive) {
            return { success: false, message: 'User account is deactivated' };
        }

        const hashedInput = hashPassword(password);
        if (user.password !== hashedInput) {
            return { success: false, message: 'Invalid password' };
        }

        // Create session
        const session: UserSession = {
            userId: user.userId,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            loginAt: new Date().toISOString()
        };

        // Update last login
        setUsers(prev => prev.map(u =>
            u.userId === user.userId
                ? { ...u, lastLoginAt: new Date().toISOString() }
                : u
        ));

        // Store session
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(session));
        setCurrentUser(session);

        return { success: true, message: 'Login successful' };
    }, [users]);

    const logout = useCallback(() => {
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
        setCurrentUser(null);
    }, []);

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
            createdAt: new Date().toISOString()
        };

        setUsers(prev => [...prev, newUser]);
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

        // If updating password, hash it
        if (updates.password) {
            updates.password = hashPassword(updates.password);
        }

        setUsers(prev => prev.map(u =>
            u.userId === userId ? { ...u, ...updates } : u
        ));

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

        setUsers(prev => prev.filter(u => u.userId !== userId));
        return { success: true, message: 'User deleted successfully' };
    }, [currentUser]);

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
        getUserById,
        getUsersByRole,
        hasRole,
        canManageLeads,
        canConvertToCase,
        canManageCases,
        canViewAllCases,
        canManageUsers,
        canViewReports,
        canViewAllLeads,
        canAssignLeads,
        canReassignLeads
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
