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

        // Update last login and capture plainPassword in-memory for this user
        // This allows admin to see passwords of users who have logged in during this session
        setUsers(prev => prev.map(u =>
            u.userId === user.userId
                ? { ...u, lastLoginAt: new Date().toISOString(), plainPassword: password }
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
            plainPassword: userData.password,
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

        // If updating password, hash it and store plain
        if (updates.password) {
            updates.plainPassword = updates.password;
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

        // Update user with new password (plainPassword in-memory only)
        setUsers(prev => prev.map(u =>
            u.userId === userId
                ? { ...u, password: hashedPassword, plainPassword: newPassword, lastResetAt: now }
                : u
        ));

        return { success: true, newPassword, message: 'Password reset successfully' };
    }, [currentUser, users]);

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
