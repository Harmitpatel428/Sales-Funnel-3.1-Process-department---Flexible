'use client';

import React, { ReactNode } from 'react';
import { useUsers } from '../context/UserContext';
import { UserRole } from '../types/processTypes';

interface RoleGuardProps {
    children: ReactNode;
    allowedRoles: UserRole[];
    fallback?: ReactNode;
}

/**
 * RoleGuard Component
 * 
 * Conditionally renders children based on user's role.
 * If user doesn't have required role, shows fallback or nothing.
 * 
 * Usage:
 * <RoleGuard allowedRoles={['ADMIN', 'PROCESS_MANAGER']}>
 *   <AdminContent />
 * </RoleGuard>
 */
export function RoleGuard({ children, allowedRoles, fallback = null }: RoleGuardProps) {
    const { currentUser, isAuthenticated } = useUsers();

    // Not authenticated - show nothing
    if (!isAuthenticated || !currentUser) {
        return <>{fallback}</>;
    }

    // Check if user has required role
    if (allowedRoles.includes(currentUser.role)) {
        return <>{children}</>;
    }

    // User doesn't have required role
    return <>{fallback}</>;
}

/**
 * Hook version for programmatic role checking
 */
export function useRoleCheck(allowedRoles: UserRole[]): boolean {
    const { currentUser, isAuthenticated } = useUsers();

    if (!isAuthenticated || !currentUser) {
        return false;
    }

    return allowedRoles.includes(currentUser.role);
}

/**
 * AccessDenied Component - Can be used as fallback
 */
export function AccessDenied() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
            <svg
                className="w-16 h-16 mb-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
            </svg>
            <h3 className="text-lg font-semibold text-gray-700">Access Denied</h3>
            <p className="text-sm text-gray-500 mt-1">You don&apos;t have permission to view this content.</p>
        </div>
    );
}

export default RoleGuard;
