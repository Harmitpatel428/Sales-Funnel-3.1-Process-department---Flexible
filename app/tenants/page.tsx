'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUsers } from '../context/UserContext';
import { useTenant } from '../context/TenantContext';
import { getTenants, createTenant, updateTenant, deleteTenant } from '../actions/tenant';
import { useRouter } from 'next/navigation';

interface TenantData {
    id: string;
    name: string;
    subdomain: string | null;
    slug: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    brandingConfig: Record<string, unknown>;
    features: Record<string, unknown>;
    isActive: boolean;
}

export default function TenantsPage() {
    const { currentUser, isAuthenticated } = useUsers();
    const { refreshTenants } = useTenant();
    const router = useRouter();
    const [tenants, setTenants] = useState<TenantData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingTenant, setEditingTenant] = useState<TenantData | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        subdomain: '',
        slug: '',
        subscriptionTier: 'FREE',
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Check if user is super admin
    useEffect(() => {
        if (isAuthenticated && currentUser && currentUser.role !== 'SUPER_ADMIN') {
            router.push('/');
        }
    }, [currentUser, isAuthenticated, router]);

    const loadTenants = useCallback(async () => {
        setIsLoading(true);
        const result = await getTenants();
        if (result.success && result.tenants) {
            setTenants(result.tenants);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (currentUser?.role === 'SUPER_ADMIN') {
            loadTenants();
        }
    }, [currentUser, loadTenants]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.name || !formData.slug) {
            setError('Name and slug are required');
            return;
        }

        const result = await createTenant({
            name: formData.name,
            subdomain: formData.subdomain || undefined,
            slug: formData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            subscriptionTier: formData.subscriptionTier,
        });

        if (result.success) {
            setSuccess('Tenant created successfully');
            setShowCreateModal(false);
            setFormData({ name: '', subdomain: '', slug: '', subscriptionTier: 'FREE' });
            await loadTenants();
            await refreshTenants();
        } else {
            setError(result.message);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;

        setError('');

        const result = await updateTenant(editingTenant.id, {
            name: formData.name,
            subdomain: formData.subdomain || undefined,
            subscriptionTier: formData.subscriptionTier,
        });

        if (result.success) {
            setSuccess('Tenant updated successfully');
            setShowEditModal(false);
            setEditingTenant(null);
            setFormData({ name: '', subdomain: '', slug: '', subscriptionTier: 'FREE' });
            await loadTenants();
            await refreshTenants();
        } else {
            setError(result.message);
        }
    };

    const handleDelete = async (tenantId: string) => {
        if (!confirm('Are you sure you want to deactivate this tenant? This action can be reversed.')) {
            return;
        }

        const result = await deleteTenant(tenantId);
        if (result.success) {
            setSuccess('Tenant deactivated successfully');
            await loadTenants();
            await refreshTenants();
        } else {
            setError(result.message);
        }
    };

    const openEditModal = (tenant: TenantData) => {
        setEditingTenant(tenant);
        setFormData({
            name: tenant.name,
            subdomain: tenant.subdomain || '',
            slug: tenant.slug,
            subscriptionTier: tenant.subscriptionTier,
        });
        setShowEditModal(true);
    };

    if (!isAuthenticated || currentUser?.role !== 'SUPER_ADMIN') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
                <button
                    onClick={() => {
                        setFormData({ name: '', subdomain: '', slug: '', subscriptionTier: 'FREE' });
                        setShowCreateModal(true);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                    Create Tenant
                </button>
            </div>

            {/* Messages */}
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
                    {error}
                    <button onClick={() => setError('')} className="float-right text-red-500 hover:text-red-700">×</button>
                </div>
            )}
            {success && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-md">
                    {success}
                    <button onClick={() => setSuccess('')} className="float-right text-green-500 hover:text-green-700">×</button>
                </div>
            )}

            {/* Tenant list table */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subdomain</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tenants.map((tenant) => (
                                <tr key={tenant.id} className={!tenant.isActive ? 'bg-gray-50 opacity-60' : ''}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{tenant.slug}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{tenant.subdomain || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700">
                                            {tenant.subscriptionTier}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${tenant.subscriptionStatus === 'ACTIVE'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                            {tenant.subscriptionStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${tenant.isActive
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                            {tenant.isActive ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => openEditModal(tenant)}
                                            className="text-purple-600 hover:text-purple-900 mr-4"
                                        >
                                            Edit
                                        </button>
                                        {tenant.isActive && (
                                            <button
                                                onClick={() => handleDelete(tenant.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Deactivate
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {tenants.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                        No tenants found. Create your first tenant to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Create New Tenant</h2>
                        <form onSubmit={handleCreate}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="Organization Name"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                                    <input
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="organization-slug"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                                    <input
                                        type="text"
                                        value={formData.subdomain}
                                        onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase() })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="subdomain (optional)"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Tier</label>
                                    <select
                                        value={formData.subscriptionTier}
                                        onChange={(e) => setFormData({ ...formData, subscriptionTier: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="FREE">Free</option>
                                        <option value="STARTER">Starter</option>
                                        <option value="PROFESSIONAL">Professional</option>
                                        <option value="ENTERPRISE">Enterprise</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                                >
                                    Create Tenant
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && editingTenant && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Edit Tenant</h2>
                        <form onSubmit={handleUpdate}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="Organization Name"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                                    <input
                                        type="text"
                                        value={formData.slug}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Slug cannot be changed after creation</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                                    <input
                                        type="text"
                                        value={formData.subdomain}
                                        onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase() })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="subdomain (optional)"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Tier</label>
                                    <select
                                        value={formData.subscriptionTier}
                                        onChange={(e) => setFormData({ ...formData, subscriptionTier: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="FREE">Free</option>
                                        <option value="STARTER">Starter</option>
                                        <option value="PROFESSIONAL">Professional</option>
                                        <option value="ENTERPRISE">Enterprise</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingTenant(null);
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                                >
                                    Update Tenant
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
