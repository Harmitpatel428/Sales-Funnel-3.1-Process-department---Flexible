'use client';

import { useState } from 'react';
import { useUsers } from '@/app/context/UserContext';

export function PermissionTestingPanel() {
    const { users, currentUser, overrideCurrentUser } = useUsers();
    const [testingAsUser, setTestingAsUser] = useState<string | null>(null);

    const handleViewAs = async (userId: string) => {
        const user = users.find(u => u.userId === userId);
        if (!user) return;

        // Override current user for testing
        overrideCurrentUser({
            userId: user.userId,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            // Pass other fields if needed for full session simulation
            permissions: user.permissions // Important for testing RBAC
        });

        setTestingAsUser(userId);

        // Log permission testing start
        await fetch('/api/audit/permission-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'start',
                targetUserId: userId,
                targetRoleId: user.roleId || user.role
            })
        });
    };

    const handleStopTesting = async () => {
        // Log permission testing end
        await fetch('/api/audit/permission-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'stop'
            })
        });

        // Restore original user
        window.location.reload();
    };

    // Admin only visibility usually, but for now we expose it based on usage in Roles Page

    if (testingAsUser) {
        const testedUser = users.find(u => u.userId === testingAsUser);
        const permissionCount = testedUser?.permissions?.length || 0;

        return (
            <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white px-4 py-2 z-50">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <span className="font-semibold">
                            🔍 Testing Permissions As: {testedUser?.name}
                        </span>
                        <span className="text-sm bg-orange-600 px-2 py-0.5 rounded">
                            Role: {testedUser?.role}
                        </span>
                        <span className="text-sm bg-orange-600 px-2 py-0.5 rounded">
                            {permissionCount} permissions
                        </span>
                    </div>
                    <button
                        onClick={handleStopTesting}
                        className="bg-white text-orange-600 px-3 py-1 rounded hover:bg-orange-50"
                    >
                        Stop Testing
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3">Test User Permissions</h3>
            <select
                onChange={(e) => handleViewAs(e.target.value)}
                className="w-full border rounded px-3 py-2"
                value={testingAsUser || ''}
            >
                <option value="">Select user to test...</option>
                {users.filter(u => u.userId !== currentUser?.userId).map(user => (
                    <option key={user.userId} value={user.userId}>
                        {user.name} ({user.role})
                    </option>
                ))}
            </select>
        </div>
    );
}
