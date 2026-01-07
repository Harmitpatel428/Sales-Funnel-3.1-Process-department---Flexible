'use client';

import { useUsers } from '../context/UserContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AuditLogViewer from '../components/AuditLogViewer';
import RoleGuard from '../components/RoleGuard';

export default function AuditLogsPage() {
    const { canManageUsers } = useUsers();
    const router = useRouter();

    useEffect(() => {
        if (!canManageUsers()) {
            router.push('/dashboard');
        }
    }, [canManageUsers, router]);

    return (
        <RoleGuard allowedRoles={['ADMIN']}>
            <div className="min-h-screen bg-gray-50">
                <AuditLogViewer />
            </div>
        </RoleGuard>
    );
}
