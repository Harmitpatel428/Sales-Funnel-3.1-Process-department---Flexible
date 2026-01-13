'use client';

/**
 * SLA Management Page
 */

import { useState, useEffect } from 'react';

interface SLAPolicy {
    id: string;
    name: string;
    entityType: string;
    statusTrigger: string;
    targetMinutes: number;
    isActive: boolean;
    escalationWorkflow?: { id: string; name: string };
    _count: { trackers: number };
}

interface Dashboard {
    onTrack: number;
    atRisk: number;
    breached: number;
    completed: number;
    averageCompletionTime: number;
    breachRate: number;
}

export default function SLAPage() {
    const [policies, setPolicies] = useState<SLAPolicy[]>([]);
    const [dashboard, setDashboard] = useState<Dashboard | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<SLAPolicy | null>(null);
    const [form, setForm] = useState({
        name: '', entityType: 'LEAD', statusTrigger: '', targetMinutes: 60, isActive: true
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [policiesRes, dashboardRes] = await Promise.all([
            fetch('/api/sla/policies'),
            fetch('/api/sla/dashboard')
        ]);
        setPolicies((await policiesRes.json()).policies || []);
        setDashboard(await dashboardRes.json());
    };

    const savePolicy = async () => {
        const url = editingPolicy ? `/api/sla/policies/${editingPolicy.id}` : '/api/sla/policies';
        const method = editingPolicy ? 'PUT' : 'POST';
        await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        setShowForm(false);
        setEditingPolicy(null);
        setForm({ name: '', entityType: 'LEAD', statusTrigger: '', targetMinutes: 60, isActive: true });
        fetchData();
    };

    const deletePolicy = async (id: string) => {
        if (confirm('Delete this SLA policy?')) {
            await fetch(`/api/sla/policies/${id}`, { method: 'DELETE' });
            fetchData();
        }
    };

    const formatDuration = (minutes: number): string => {
        if (minutes < 60) return `${minutes} min`;
        if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
        return `${Math.round(minutes / 1440)} days`;
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">SLA Management</h1>
                <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    + New SLA Policy
                </button>
            </div>

            {/* Dashboard */}
            {dashboard && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-green-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-green-700">{dashboard.onTrack}</div>
                        <div className="text-sm text-green-600">On Track</div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-yellow-700">{dashboard.atRisk}</div>
                        <div className="text-sm text-yellow-600">At Risk</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-red-700">{dashboard.breached}</div>
                        <div className="text-sm text-red-600">Breached</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-700">{dashboard.breachRate.toFixed(1)}%</div>
                        <div className="text-sm text-blue-600">Breach Rate</div>
                    </div>
                </div>
            )}

            {/* Policies Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Entity</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trigger Status</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Target</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {policies.map((policy) => (
                            <tr key={policy.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium">{policy.name}</td>
                                <td className="px-6 py-4 text-sm">{policy.entityType}</td>
                                <td className="px-6 py-4 text-sm">{policy.statusTrigger}</td>
                                <td className="px-6 py-4 text-sm">{formatDuration(policy.targetMinutes)}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 text-xs rounded-full ${policy.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                        {policy.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <button onClick={() => { setEditingPolicy(policy); setForm(policy as unknown as typeof form); setShowForm(true); }} className="text-blue-600 hover:underline text-sm mr-3">Edit</button>
                                    <button onClick={() => deletePolicy(policy.id)} className="text-red-600 hover:underline text-sm">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-medium mb-4">{editingPolicy ? 'Edit' : 'New'} SLA Policy</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1">Name</label>
                                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-3 py-2" />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Entity Type</label>
                                <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} className="w-full border rounded px-3 py-2">
                                    <option value="LEAD">Lead</option>
                                    <option value="CASE">Case</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Trigger Status</label>
                                <input type="text" value={form.statusTrigger} onChange={(e) => setForm({ ...form, statusTrigger: e.target.value })} placeholder="e.g., NEW" className="w-full border rounded px-3 py-2" />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Target (minutes)</label>
                                <input type="number" value={form.targetMinutes} onChange={(e) => setForm({ ...form, targetMinutes: parseInt(e.target.value) })} className="w-full border rounded px-3 py-2" />
                            </div>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                                <span>Active</span>
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => { setShowForm(false); setEditingPolicy(null); }} className="px-4 py-2 border rounded">Cancel</button>
                            <button onClick={savePolicy} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
