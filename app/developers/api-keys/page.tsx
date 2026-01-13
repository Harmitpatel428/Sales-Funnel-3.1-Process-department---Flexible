'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ApiKey {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    rateLimit: number;
    isActive: boolean;
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    environment: string;
    description: string | null;
}

export default function ApiKeysPage() {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        scopes: [] as string[],
        rateLimit: 1000,
        environment: 'production',
        description: '',
    });

    const availableScopes = [
        { value: 'leads:read', label: 'Read Leads' },
        { value: 'leads:write', label: 'Write Leads' },
        { value: 'leads:delete', label: 'Delete Leads' },
        { value: 'cases:read', label: 'Read Cases' },
        { value: 'cases:write', label: 'Write Cases' },
        { value: 'documents:read', label: 'Read Documents' },
        { value: 'documents:write', label: 'Write Documents' },
        { value: 'webhooks:read', label: 'Read Webhooks' },
        { value: 'webhooks:write', label: 'Write Webhooks' },
        { value: 'integrations:read', label: 'Read Integrations' },
        { value: 'integrations:write', label: 'Write Integrations' },
    ];

    useEffect(() => {
        fetchApiKeys();
    }, []);

    async function fetchApiKeys() {
        try {
            const res = await fetch('/api/api-keys');
            const data = await res.json();
            if (data.success) {
                setApiKeys(data.data);
            }
        } catch (error) {
            console.error('Error fetching API keys:', error);
        } finally {
            setLoading(false);
        }
    }

    async function createApiKey() {
        try {
            const res = await fetch('/api/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            if (data.success) {
                setNewKey(data.data.key);
                fetchApiKeys();
                setFormData({
                    name: '',
                    scopes: [],
                    rateLimit: 1000,
                    environment: 'production',
                    description: '',
                });
            }
        } catch (error) {
            console.error('Error creating API key:', error);
        }
    }

    async function revokeApiKey(id: string) {
        if (!confirm('Are you sure you want to revoke this API key?')) return;

        try {
            const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchApiKeys();
            }
        } catch (error) {
            console.error('Error revoking API key:', error);
        }
    }

    function toggleScope(scope: string) {
        setFormData(prev => ({
            ...prev,
            scopes: prev.scopes.includes(scope)
                ? prev.scopes.filter(s => s !== scope)
                : [...prev.scopes, scope],
        }));
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-8 px-4">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <Link href="/developers" className="text-blue-600 hover:underline text-sm">
                            ← Back to Developer Portal
                        </Link>
                        <h1 className="text-3xl font-bold mt-2">API Keys</h1>
                        <p className="text-gray-600">Manage your API keys for authentication</p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                    >
                        Create API Key
                    </button>
                </div>

                {/* API Keys List */}
                <div className="space-y-4">
                    {apiKeys.length === 0 ? (
                        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                            <p className="text-gray-500 mb-4">No API keys created yet</p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="text-blue-600 hover:underline"
                            >
                                Create your first API key
                            </button>
                        </div>
                    ) : (
                        apiKeys.map(key => (
                            <div key={key.id} className="bg-white rounded-lg shadow-sm p-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-lg">{key.name}</h3>
                                            <span className={`px-2 py-0.5 rounded text-xs ${key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {key.isActive ? 'Active' : 'Revoked'}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${key.environment === 'production' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {key.environment}
                                            </span>
                                        </div>
                                        <p className="text-gray-500 text-sm font-mono mt-1">{key.keyPrefix}...</p>
                                        {key.description && <p className="text-gray-600 text-sm mt-2">{key.description}</p>}
                                    </div>
                                    <button
                                        onClick={() => revokeApiKey(key.id)}
                                        className="text-red-600 hover:text-red-800 text-sm"
                                        disabled={!key.isActive}
                                    >
                                        Revoke
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {key.scopes.map(scope => (
                                        <span key={scope} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                                            {scope}
                                        </span>
                                    ))}
                                </div>

                                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
                                    <div>
                                        <span className="block font-medium">Rate Limit</span>
                                        {key.rateLimit}/hour
                                    </div>
                                    <div>
                                        <span className="block font-medium">Created</span>
                                        {new Date(key.createdAt).toLocaleDateString()}
                                    </div>
                                    <div>
                                        <span className="block font-medium">Last Used</span>
                                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                                    </div>
                                    <div>
                                        <span className="block font-medium">Expires</span>
                                        {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                            <h2 className="text-xl font-bold mb-4">Create API Key</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="My API Key"
                                        className="w-full border rounded px-3 py-2"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Description</label>
                                    <input
                                        type="text"
                                        value={formData.description}
                                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="What is this key for?"
                                        className="w-full border rounded px-3 py-2"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Environment</label>
                                    <select
                                        value={formData.environment}
                                        onChange={e => setFormData(prev => ({ ...prev, environment: e.target.value }))}
                                        className="w-full border rounded px-3 py-2"
                                    >
                                        <option value="production">Production</option>
                                        <option value="sandbox">Sandbox</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Rate Limit (per hour)</label>
                                    <input
                                        type="number"
                                        value={formData.rateLimit}
                                        onChange={e => setFormData(prev => ({ ...prev, rateLimit: parseInt(e.target.value) || 1000 }))}
                                        min={100}
                                        max={10000}
                                        className="w-full border rounded px-3 py-2"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Scopes *</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                                        {availableScopes.map(scope => (
                                            <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.scopes.includes(scope.value)}
                                                    onChange={() => toggleScope(scope.value)}
                                                    className="rounded"
                                                />
                                                <span className="text-sm">{scope.label}</span>
                                                <span className="text-xs text-gray-400">{scope.value}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 border rounded px-4 py-2 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={createApiKey}
                                    disabled={!formData.name || formData.scopes.length === 0}
                                    className="flex-1 bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Create Key
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* New Key Modal */}
                {newKey && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 w-full max-w-lg">
                            <h2 className="text-xl font-bold mb-4 text-green-600">✓ API Key Created</h2>

                            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                                <p className="text-yellow-800 text-sm font-medium mb-2">
                                    ⚠️ Save this key now. You won't be able to see it again!
                                </p>
                                <div className="bg-white border rounded p-3 font-mono text-sm break-all">
                                    {newKey}
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(newKey);
                                    alert('API key copied to clipboard!');
                                }}
                                className="w-full border rounded px-4 py-2 mb-3 hover:bg-gray-50"
                            >
                                📋 Copy to Clipboard
                            </button>

                            <button
                                onClick={() => {
                                    setNewKey(null);
                                    setShowCreateModal(false);
                                }}
                                className="w-full bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
