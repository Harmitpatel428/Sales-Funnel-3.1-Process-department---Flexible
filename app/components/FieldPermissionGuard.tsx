'use client';

import { useEffect, useState } from 'react';
import { useUsers } from '@/app/context/UserContext';

interface FieldPermissionGuardProps {
    resource: string;
    fieldName: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
    mode?: 'view' | 'edit';
}

export function FieldPermissionGuard({
    resource,
    fieldName,
    children,
    fallback = null,
    mode = 'view'
}: FieldPermissionGuardProps) {
    const { canViewField, canEditField } = useUsers();

    // Now synchronous!
    const hasPermission = mode === 'view'
        ? canViewField(resource, fieldName)
        : canEditField(resource, fieldName);

    if (!hasPermission) return <>{fallback}</>;
    return <>{children}</>;
}
