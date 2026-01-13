'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Installation {
    id: string;
    isActive: boolean;
    lastSyncAt: string | null;
    syncStatus: string | null;
    syncError: string | null;
    integration: {
        name: string;
        slug: string;
        category: string;
        logoUrl: string | null;
    };
}

interface WebhookDelivery {
    id: string;
    event: string;
    status: string;
    statusCode: number | null;
    attempts: number;
    createdAt: string;
}

export default function IntegrationMonitorPage() {
    const [installations, setInstallations] = useState<Installation[]>([]);
    const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    async function fetchData() {
        try {
            const [installsRes, webhooksRes] = await Promise.all([
                fetch('/api/integrations?installed=true'),
                fetch('/api/webhooks/outgoing'),
            ]);

            const installsData = await installsRes.json();
            const webhooksData = await webhooksRes.json();

            if (installsData.success) {
                setInstallations(installsData.data.filter((i: any) => i.installed).map((i: any) => ({
                    id: i.id,
                    isActive: i.installation?.isActive ?? false,
                    lastSyncAt: i.installation?.lastSyncAt,
                    syncStatus: i.installation?.syncStatus,
                    syncError: i.installation?.syncError,
                    integration: {
                        name: i.name,
                        slug: i.slug,
                        category: i.category,
                        logoUrl: i.logoUrl,
                    },
                })));
            }

            if (webhooksData.success) {
                // Flatten deliveries from subscriptions
                const deliveries: WebhookDelivery[] = [];
                // Note: In a real app, we'd have a separate deliveries endpoint
                setWebhookDeliveries(deliveries);
            }

            setLastRefresh(new Date());
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    function calculateSuccessRate(): number {
        if (webhookDeliveries.length === 0) return 100;
        const successful = webhookDeliveries.filter(d => d.status === 'SUCCESS').length;
        return Math.round((successful / webhookDeliveries.length) * 100);
    }

    const activeIntegrations = installations.filter(i => i.isActive).length;
    const failedDeliveries = webhookDeliveries.filter(d => d.status === 'FAILED').length;

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
                        <h1 className="text-3xl font-bold">Integration Monitoring</h1>
                        <p className="text-gray-600">Monitor integration health and webhook deliveries</p>
                    </div>
                    <div className="text-sm text-gray-500">
                        Last updated: {lastRefresh.toLocaleTimeString()}
                        <button
                            onClick={fetchData}
                            className="ml-2 text-blue-600 hover:underline"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="text-sm text-gray-500 mb-1">Active Integrations</div>
                        <div className="text-3xl font-bold text-blue-600">{activeIntegrations}</div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="text-sm text-gray-500 mb-1">Total Installed</div>
                        <div className="text-3xl font-bold">{installations.length}</div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="text-sm text-gray-500 mb-1">Webhook Success Rate</div>
                        <div className={`text-3xl font-bold ${calculateSuccessRate() >= 90 ? 'text-green-600' :
                                calculateSuccessRate() >= 70 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                            {calculateSuccessRate()}%
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="text-sm text-gray-500 mb-1">Failed Deliveries (24h)</div>
                        <div className={`text-3xl font-bold ${failedDeliveries > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {failedDeliveries}
                        </div>
                    </div>
                </div>

                {/* Integration Status */}
                <div className="bg-white rounded-lg shadow-sm mb-8">
                    <div className="px-6 py-4 border-b">
                        <h2 className="text-xl font-semibold">Integration Status</h2>
                    </div>

                    {installations.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No integrations installed.{' '}
                            <Link href="/marketplace" className="text-blue-600 hover:underline">
                                Browse marketplace
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {installations.map(install => (
                                <div key={install.id} className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                            {install.integration.logoUrl ? (
                                                <img src={install.integration.logoUrl} alt="" className="w-6 h-6" />
                                            ) : (
                                                install.integration.name.charAt(0)
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-medium">{install.integration.name}</div>
                                            <div className="text-sm text-gray-500">
                                                Last sync: {install.lastSyncAt
                                                    ? new Date(install.lastSyncAt).toLocaleString()
                                                    : 'Never synced'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <span className={`px-3 py-1 rounded-full text-sm ${install.syncStatus === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                                                install.syncStatus === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                    install.syncStatus === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-gray-100 text-gray-800'
                                            }`}>
                                            {install.syncStatus || 'Not synced'}
                                        </span>

                                        <span className={`w-3 h-3 rounded-full ${install.isActive ? 'bg-green-500' : 'bg-gray-300'
                                            }`} title={install.isActive ? 'Active' : 'Inactive'} />

                                        <Link
                                            href={`/marketplace/${install.integration.slug}`}
                                            className="text-blue-600 hover:underline text-sm"
                                        >
                                            Configure
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Webhook Deliveries */}
                <div className="bg-white rounded-lg shadow-sm">
                    <div className="px-6 py-4 border-b flex justify-between items-center">
                        <h2 className="text-xl font-semibold">Recent Webhook Deliveries</h2>
                        <Link href="/developers/webhooks" className="text-blue-600 hover:underline text-sm">
                            Manage webhooks →
                        </Link>
                    </div>

                    {webhookDeliveries.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No webhook deliveries yet.{' '}
                            <Link href="/developers/webhooks" className="text-blue-600 hover:underline">
                                Configure webhooks
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left p-4 font-medium text-gray-600">Event</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Status</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Response</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Attempts</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {webhookDeliveries.slice(0, 20).map(delivery => (
                                        <tr key={delivery.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-mono text-sm">{delivery.event}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs ${delivery.status === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                                                        delivery.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                            'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {delivery.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm text-gray-600">
                                                {delivery.statusCode || '-'}
                                            </td>
                                            <td className="p-4 text-sm">{delivery.attempts}</td>
                                            <td className="p-4 text-sm text-gray-500">
                                                {new Date(delivery.createdAt).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="mt-8 flex gap-4">
                    <Link
                        href="/marketplace"
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                    >
                        Browse Marketplace
                    </Link>
                    <Link
                        href="/developers/webhooks"
                        className="border border-gray-300 px-6 py-2 rounded hover:bg-gray-50"
                    >
                        Manage Webhooks
                    </Link>
                    <Link
                        href="/api/analytics/usage"
                        className="border border-gray-300 px-6 py-2 rounded hover:bg-gray-50"
                    >
                        View API Usage
                    </Link>
                </div>
            </div>
        </div>
    );
}
