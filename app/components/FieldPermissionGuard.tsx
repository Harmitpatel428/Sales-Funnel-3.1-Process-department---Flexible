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
    const [hasPermission, setHasPermission] = useState(false);

    useEffect(() => {
        const checkPermission = async () => {
            const allowed = mode === 'view'
                ? await canViewField(resource, fieldName)
                : await canEditField(resource, fieldName);
            setHasPermission(allowed);
        };
        checkPermission();
    }, [resource, fieldName, mode, canViewField, canEditField]);

    if (!hasPermission) return <>{fallback}</>;
    return <>{children}</>;
}
