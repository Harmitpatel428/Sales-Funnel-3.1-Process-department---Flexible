'use client';

import { useState, useEffect } from 'react';
import { RoleGuard } from '@/app/components/RoleGuard';
import { PermissionTestingPanel } from '@/app/components/PermissionTestingPanel';
import { PERMISSIONS, PERMISSION_METADATA, PermissionCategory, SENSITIVE_FIELDS } from '@/app/types/permissions';

export default function RolesPage() {
    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [roleName, setRoleName] = useState('');
    const [roleDescription, setRoleDescription] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
    const [fieldPermissions, setFieldPermissions] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});

    useEffect(() => {
        loadRoles();
    }, []);

    const loadRoles = async () => {
        try {
            const res = await fetch('/api/roles');
            if (res.ok) {
                const data = await res.json();
                if (data.success) setRoles(data.data);
            }
        } catch (e) {
            console.error("Failed to load roles", e);
        }
    };

    // Group permissions by category
    const permissionsByCategory = Object.entries(PERMISSIONS).reduce((acc, [key, value]) => {
        const metadata = PERMISSION_METADATA[value];
        if (!metadata) return acc;

        if (!acc[metadata.category]) {
            acc[metadata.category] = [];
        }
        acc[metadata.category].push({ key, value, metadata });
        return acc;
    }, {} as Record<PermissionCategory, any[]>);

    const handleTogglePermission = (permission: string) => {
        setSelectedPermissions(prev => {
            const next = new Set(prev);
            if (next.has(permission)) {
                next.delete(permission);
            } else {
                next.add(permission);
            }
            return next;
        });
    };

    const handleToggleFieldPermission = (resource: string, field: string, type: 'view' | 'edit') => {
        const key = `${resource}.${field}`;
        setFieldPermissions(prev => {
            const current = prev[key] || { canView: false, canEdit: false };
            const updated = { ...current };

            if (type === 'view') {
                updated.canView = !updated.canView;
                // If viewing is disabled, editing must also be disabled
                if (!updated.canView) updated.canEdit = false;
            } else {
                updated.canEdit = !updated.canEdit;
                // If editing is enabled, viewing must be enabled
                if (updated.canEdit) updated.canView = true;
            }

            return { ...prev, [key]: updated };
        });
    };

    const handleSaveRole = async () => {
        const response = await fetch('/api/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: roleName,
                description: roleDescription,
                permissions: Array.from(selectedPermissions),
                fieldPermissions: Object.entries(fieldPermissions).map(([key, perms]) => {
                    const [resource, fieldName] = key.split('.');
                    return {
                        resource,
                        fieldName,
                        canView: perms.canView,
                        canEdit: perms.canEdit
                    };
                })
            })
        });

        if (response.ok) {
            // Refresh roles list
            loadRoles();
            setIsCreating(false);
            resetForm();
        }
    };

    const resetForm = () => {
        setRoleName('');
        setRoleDescription('');
        setSelectedPermissions(new Set());
        setFieldPermissions({});
    };

    return (
        <RoleGuard allowedRoles={['ADMIN']}>
            <div className="bg-white text-black min-h-full">
                <div className="p-6 max-w-7xl mx-auto space-y-8">

                {/* Testing Panel */}
                <PermissionTestingPanel />

                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-lg font-semibold text-black">Role Management</h1>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg"
                    >
                        Create Custom Role
                    </button>
                </div>

                {/* Role Creation/Edit Form */}
                {isCreating && (
                    <div className="bg-white rounded-xl border p-6 mb-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-black mb-4">Create Custom Role</h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Role Name</label>
                                <input
                                    type="text"
                                    value={roleName}
                                    onChange={(e) => setRoleName(e.target.value)}
                                    className="w-full border rounded-lg px-3 py-2"
                                    placeholder="e.g., Regional Sales Manager"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={roleDescription}
                                    onChange={(e) => setRoleDescription(e.target.value)}
                                    className="w-full border rounded-lg px-3 py-2"
                                    placeholder="Brief description of this role"
                                />
                            </div>
                        </div>

                        {/* Permission Checkboxes by Category */}
                        <div className="space-y-6">
                            {Object.entries(permissionsByCategory).map(([category, perms]) => (
                                <div key={category} className="border rounded-lg p-4 bg-gray-50">
                                    <h3 className="text-lg font-semibold text-black mb-3 border-b pb-2">
                                        {category} Permissions
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {perms.map(({ value, metadata }) => (
                                            <label key={value} className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPermissions.has(value)}
                                                    onChange={() => handleTogglePermission(value)}
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {metadata.label}
                                                    </div>
                                                    <div className="text-xs text-gray-600">
                                                        {metadata.description}
                                                    </div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Field Permissions Section */}
                        <div className="border rounded-lg p-4 bg-gray-50 mb-6">
                            <h3 className="text-lg font-semibold text-black mb-3 border-b pb-2">
                                Field-Level Permissions
                            </h3>
                            <div className="space-y-4">
                                {Object.entries(SENSITIVE_FIELDS).map(([resource, fields]) => (
                                    <div key={resource} className="bg-white p-3 rounded border">
                                        <h4 className="font-medium capitalize text-gray-700 mb-2">{resource} Fields</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {fields.map(field => {
                                                const key = `${resource}.${field}`;
                                                const perms = fieldPermissions[key] || { canView: false, canEdit: false };
                                                return (
                                                    <div key={field} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                                                        <span className="text-sm font-medium text-gray-700 mr-2">{field}</span>
                                                        <div className="flex gap-2 text-xs">
                                                            <label className="flex items-center gap-1 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={perms.canView}
                                                                    onChange={() => handleToggleFieldPermission(resource, field, 'view')}
                                                                />
                                                                View
                                                            </label>
                                                            <label className="flex items-center gap-1 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={perms.canEdit}
                                                                    onChange={() => handleToggleFieldPermission(resource, field, 'edit')}
                                                                />
                                                                Edit
                                                            </label>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => { setIsCreating(false); resetForm(); }}
                                className="px-4 py-2 bg-gray-200 text-black hover:bg-gray-300 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveRole}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
                            >
                                Save Role
                            </button>
                        </div>
                    </div>
                )}

                {/* Roles List */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100 text-black font-medium">
                            <tr>
                                <th className="px-6 py-3 text-left text-sm font-medium text-black">
                                    Role Name
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-black">
                                    Description
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-black">
                                    Type
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-black">
                                    Users
                                </th>
                                <th className="px-6 py-3 text-right text-sm font-medium text-black">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-gray-800">
                            {roles.map((role: any) => (
                                <tr key={role.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-800">{role.name}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-600">{role.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${role.isSystem ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                            {role.isSystem ? 'System' : 'Custom'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                        {role._count?.users || 0}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button className="text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                                        {!role.isSystem && (
                                            <button className="text-red-600 hover:text-red-900">Delete</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {roles.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-gray-600">
                                        No custom roles found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </div>
            </div>
        </RoleGuard>
    );
}
