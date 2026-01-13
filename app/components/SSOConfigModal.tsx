'use client';

import React, { useState, useEffect } from 'react';
import { useUsers } from '../context/UserContext';

interface SSOProvider {
    id: string;
    name: string;
    type: 'SAML' | 'OIDC';
    metadataUrl?: string; // SAML
    clientId?: string; // OIDC
    clientSecret?: string; // OIDC
    issuer?: string; // OIDC/SAML
    acsUrl?: string; // SAML
    entityId?: string; // SAML
    authorizationUrl?: string; // OIDC
    tokenUrl?: string; // OIDC
    userInfoUrl?: string; // OIDC
}

interface SSOConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SSOConfigModal({ isOpen, onClose }: SSOConfigModalProps) {
    const { isAuthenticated } = useUsers();
    const [providers, setProviders] = useState<SSOProvider[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<SSOProvider>>({
        type: 'SAML', // Default
        name: '',
    });

    useEffect(() => {
        if (isOpen && isAuthenticated) {
            fetchProviders();
        }
    }, [isOpen, isAuthenticated]);

    const fetchProviders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/sso');
            if (res.ok) {
                const data = await res.json();
                setProviders(data);
            } else {
                setError('Failed to load SSO providers');
            }
        } catch (err) {
            setError('Error loading providers');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const method = formData.id ? 'PUT' : 'POST';
            const res = await fetch('/api/admin/sso', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                fetchProviders();
                setIsEditing(false);
                setFormData({ type: 'SAML', name: '' });
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to save provider');
            }
        } catch (err) {
            setError('Failed to save provider');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this provider? Users may lose access.')) return;

        try {
            const res = await fetch(`/api/admin/sso?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchProviders();
            } else {
                setError('Failed to delete provider');
            }
        } catch (err) {
            setError('Error deleting provider');
        }
    };

    const startEdit = (provider?: SSOProvider) => {
        if (provider) {
            setFormData(provider);
        } else {
            setFormData({ type: 'SAML', name: '' });
        }
        setIsEditing(true);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
                <div className="bg-gray-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <h2 className="text-xl font-bold">SSO Configuration</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-grow">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    {!isEditing ? (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-medium text-gray-900">Configured Providers</h3>
                                <button
                                    onClick={() => startEdit()}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
                                >
                                    Add Provider
                                </button>
                            </div>

                            {isLoading ? (
                                <div className="text-center py-8 text-gray-500">Loading...</div>
                            ) : providers.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                    No SSO providers configured. Add one to enable Single Sign-On.
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {providers.map((p) => (
                                        <div key={p.id} className="border rounded-lg p-4 flex justify-between items-center hover:bg-gray-50">
                                            <div>
                                                <h4 className="font-semibold text-gray-900">{p.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.type === 'SAML' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                                        {p.type}
                                                    </span>
                                                    <span className="text-xs text-gray-500">{p.issuer}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => startEdit(p)} className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1 border border-blue-200 rounded hover:bg-blue-50">Edit</button>
                                                <button onClick={() => handleDelete(p.id)} className="text-sm text-red-600 hover:text-red-800 px-3 py-1 border border-red-200 rounded hover:bg-red-50">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-gray-900">{formData.id ? 'Edit Provider' : 'Add New Provider'}</h3>
                                <button type="button" onClick={() => setIsEditing(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Provider Name</label>
                                    <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" placeholder="e.g. Corporate Okta" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Protocol Type</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as 'SAML' | 'OIDC' })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2">
                                        <option value="SAML">SAML 2.0</option>
                                        <option value="OIDC">OIDC / OAuth 2.0</option>
                                    </select>
                                </div>
                            </div>

                            {formData.type === 'SAML' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Metadata URL (Recommended)</label>
                                        <input type="url" value={formData.metadataUrl || ''} onChange={e => setFormData({ ...formData, metadataUrl: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" placeholder="https://idp.example.com/metadata" />
                                        <p className="text-xs text-gray-500 mt-1">If provided, other fields can be auto-discovered.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Entity ID (Issuer)</label>
                                        <input type="text" value={formData.issuer || ''} onChange={e => setFormData({ ...formData, issuer: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">ACS URL</label>
                                        <input type="url" value={formData.acsUrl || ''} onChange={e => setFormData({ ...formData, acsUrl: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Client ID</label>
                                            <input type="text" required value={formData.clientId || ''} onChange={e => setFormData({ ...formData, clientId: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Client Secret</label>
                                            <input type="password" required value={formData.clientSecret || ''} onChange={e => setFormData({ ...formData, clientSecret: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Issuer / Authority URL</label>
                                        <input type="url" required value={formData.issuer || ''} onChange={e => setFormData({ ...formData, issuer: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm border p-2" />
                                    </div>
                                </>
                            )}

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                                <button type="submit" disabled={isLoading} className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
                                    {isLoading ? 'Saving...' : 'Save Configuration'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
