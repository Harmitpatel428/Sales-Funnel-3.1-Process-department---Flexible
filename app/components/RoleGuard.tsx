'use client';

import { useUsers } from '@/app/context/UserContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles: string[];
    fallback?: React.ReactNode;
}

export function RoleGuard({ children, allowedRoles, fallback }: RoleGuardProps) {
    const { currentUser, isLoading } = useUsers();
    const router = useRouter();

    // Check if user has one of the allowed roles
    const hasAccess = currentUser && allowedRoles.includes(currentUser.role);
    // Also consider permissions if we want to migrate fully?
    // For now, this component is used as explicit RoleGuard, so we check role.

    if (isLoading) {
        return <div>Loading...</div>; // Or return null
    }

    if (!hasAccess) {
        return fallback ? <>{fallback}</> : <div className="p-4 text-red-500">Access Denied</div>;
    }

    return <>{children}</>;
}

export function AccessDenied() {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-16 w-16 text-gray-400 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-500 max-w-sm">
                You do not have permission to view this section. Please contact your administrator if you believe this is an error.
            </p>
        </div>
    );
}
