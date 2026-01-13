'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Integration {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    logoUrl: string | null;
    websiteUrl: string | null;
    isOfficial: boolean;
    installed: boolean;
    installation: {
        isActive: boolean;
        lastSyncAt: string | null;
        syncStatus: string | null;
    } | null;
}

interface Category {
    name: string;
    count: number;
}

export default function MarketplacePage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [showInstalled, setShowInstalled] = useState(false);

    useEffect(() => {
        fetchIntegrations();
    }, []);

    async function fetchIntegrations() {
        try {
            const res = await fetch('/api/integrations');
            const data = await res.json();
            if (data.success) {
                setIntegrations(data.data);
                setCategories(data.meta.categories);
            }
        } catch (error) {
            console.error('Error fetching integrations:', error);
        } finally {
            setLoading(false);
        }
    }

    async function installIntegration(slug: string) {
        // For demo, we'll just redirect to a config page
        window.location.href = `/marketplace/${slug}`;
    }

    const filteredIntegrations = integrations.filter(int => {
        const matchesSearch = int.name.toLowerCase().includes(search.toLowerCase()) ||
            int.description.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || int.category === selectedCategory;
        const matchesInstalled = !showInstalled || int.installed;
        return matchesSearch && matchesCategory && matchesInstalled;
    });

    const categoryLabels: Record<string, string> = {
        CRM: '📊 CRM',
        EMAIL: '📧 Email Marketing',
        ACCOUNTING: '💰 Accounting',
        COMMUNICATION: '💬 Communication',
        AUTOMATION: '⚡ Automation',
    };

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
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">Integration Marketplace</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Connect your favorite tools and automate your workflows with our pre-built integrations.
                    </p>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <input
                                type="text"
                                placeholder="Search integrations..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full border rounded-lg px-4 py-2"
                            />
                        </div>

                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="border rounded-lg px-4 py-2"
                        >
                            <option value="all">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat.name} value={cat.name}>
                                    {categoryLabels[cat.name] || cat.name} ({cat.count})
                                </option>
                            ))}
                        </select>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showInstalled}
                                onChange={e => setShowInstalled(e.target.checked)}
                                className="rounded"
                            />
                            <span>Installed only</span>
                        </label>
                    </div>
                </div>

                {/* Integration Grid */}
                {filteredIntegrations.length === 0 ? (
                    <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                        <p className="text-gray-500">No integrations found matching your criteria.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredIntegrations.map(integration => (
                            <div
                                key={integration.id}
                                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                            >
                                <div className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                                            {integration.logoUrl ? (
                                                <img src={integration.logoUrl} alt={integration.name} className="w-8 h-8" />
                                            ) : (
                                                integration.name.charAt(0)
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-lg">{integration.name}</h3>
                                                {integration.isOfficial && (
                                                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                                                        Official
                                                    </span>
                                                )}
                                                {integration.installed && (
                                                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded">
                                                        Installed
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm text-gray-500">
                                                {categoryLabels[integration.category] || integration.category}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="text-gray-600 text-sm mt-4 line-clamp-2">
                                        {integration.description}
                                    </p>

                                    {integration.installed && integration.installation && (
                                        <div className="mt-4 p-2 bg-gray-50 rounded text-sm">
                                            <div className="flex justify-between">
                                                <span>Status:</span>
                                                <span className={integration.installation.isActive ? 'text-green-600' : 'text-gray-500'}>
                                                    {integration.installation.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            {integration.installation.lastSyncAt && (
                                                <div className="flex justify-between text-gray-500">
                                                    <span>Last sync:</span>
                                                    <span>{new Date(integration.installation.lastSyncAt).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="border-t px-6 py-3 bg-gray-50 flex justify-between items-center">
                                    {integration.websiteUrl && (
                                        <a
                                            href={integration.websiteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-500 hover:text-gray-700 text-sm"
                                        >
                                            Learn more →
                                        </a>
                                    )}
                                    <Link
                                        href={`/marketplace/${integration.slug}`}
                                        className={`px-4 py-1.5 rounded text-sm ${integration.installed
                                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                            }`}
                                    >
                                        {integration.installed ? 'Configure' : 'Install'}
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Request Integration */}
                <div className="mt-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-center text-white">
                    <h2 className="text-2xl font-bold mb-2">Can't find what you're looking for?</h2>
                    <p className="mb-4 opacity-90">
                        Request a new integration or build your own using our API.
                    </p>
                    <div className="flex justify-center gap-4">
                        <button className="bg-white text-blue-600 px-6 py-2 rounded font-medium hover:bg-gray-100">
                            Request Integration
                        </button>
                        <Link
                            href="/developers"
                            className="bg-transparent border border-white text-white px-6 py-2 rounded font-medium hover:bg-white/10"
                        >
                            View API Docs
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
