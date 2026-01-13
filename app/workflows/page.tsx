'use client';

/**
 * Workflow Management Page
 * List and manage workflow automations
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Workflow {
    id: string;
    name: string;
    description?: string;
    triggerType: string;
    entityType: string;
    isActive: boolean;
    priority: number;
    createdAt: string;
    updatedAt: string;
    createdBy: { id: string; name: string };
    _count: { steps: number; executions: number };
}

export default function WorkflowsPage() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ entityType: '', triggerType: '', isActive: '' });

    useEffect(() => {
        fetchWorkflows();
    }, [filter]);

    const fetchWorkflows = async () => {
        try {
            const params = new URLSearchParams();
            if (filter.entityType) params.set('entityType', filter.entityType);
            if (filter.triggerType) params.set('triggerType', filter.triggerType);
            if (filter.isActive) params.set('isActive', filter.isActive);

            const res = await fetch(`/api/workflows?${params}`);
            const data = await res.json();
            setWorkflows(data.workflows || []);
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleWorkflow = async (id: string, isActive: boolean) => {
        try {
            await fetch(`/api/workflows/${id}/activate?action=${isActive ? 'deactivate' : 'activate'}`, {
                method: 'POST'
            });
            fetchWorkflows();
        } catch (error) {
            console.error('Failed to toggle workflow:', error);
        }
    };

    const deleteWorkflow = async (id: string) => {
        if (!confirm('Are you sure you want to delete this workflow?')) return;
        try {
            await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
            fetchWorkflows();
        } catch (error) {
            console.error('Failed to delete workflow:', error);
        }
    };

    const triggerTypeLabels: Record<string, string> = {
        ON_CREATE: 'On Create',
        ON_UPDATE: 'On Update',
        ON_STATUS_CHANGE: 'Status Change',
        SCHEDULED: 'Scheduled',
        MANUAL: 'Manual'
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Workflow Automation</h1>
                    <p className="text-gray-600">Automate your sales and case management processes</p>
                </div>
                <Link
                    href="/workflows/builder"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    + Create Workflow
                </Link>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-4">
                <select
                    value={filter.entityType}
                    onChange={(e) => setFilter({ ...filter, entityType: e.target.value })}
                    className="border rounded-lg px-3 py-2"
                >
                    <option value="">All Entity Types</option>
                    <option value="LEAD">Leads</option>
                    <option value="CASE">Cases</option>
                </select>
                <select
                    value={filter.triggerType}
                    onChange={(e) => setFilter({ ...filter, triggerType: e.target.value })}
                    className="border rounded-lg px-3 py-2"
                >
                    <option value="">All Triggers</option>
                    <option value="ON_CREATE">On Create</option>
                    <option value="ON_UPDATE">On Update</option>
                    <option value="ON_STATUS_CHANGE">Status Change</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="MANUAL">Manual</option>
                </select>
                <select
                    value={filter.isActive}
                    onChange={(e) => setFilter({ ...filter, isActive: e.target.value })}
                    className="border rounded-lg px-3 py-2"
                >
                    <option value="">All Status</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            </div>

            {/* Workflows Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : workflows.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <p className="mb-4">No workflows found</p>
                        <Link href="/workflows/builder" className="text-blue-600 hover:underline">
                            Create your first workflow
                        </Link>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trigger</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Entity</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Steps</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Executions</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {workflows.map((workflow) => (
                                <tr key={workflow.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{workflow.name}</div>
                                        {workflow.description && (
                                            <div className="text-sm text-gray-500">{workflow.description}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                            {triggerTypeLabels[workflow.triggerType] || workflow.triggerType}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{workflow.entityType}</td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => toggleWorkflow(workflow.id, workflow.isActive)}
                                            className={`px-2 py-1 text-xs rounded-full ${workflow.isActive
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-gray-100 text-gray-600'
                                                }`}
                                        >
                                            {workflow.isActive ? 'Active' : 'Inactive'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{workflow._count.steps}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{workflow._count.executions}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            <Link
                                                href={`/workflows/builder?id=${workflow.id}`}
                                                className="text-blue-600 hover:underline text-sm"
                                            >
                                                Edit
                                            </Link>
                                            <Link
                                                href={`/workflows/executions?workflowId=${workflow.id}`}
                                                className="text-gray-600 hover:underline text-sm"
                                            >
                                                History
                                            </Link>
                                            <button
                                                onClick={() => deleteWorkflow(workflow.id)}
                                                className="text-red-600 hover:underline text-sm"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <Link
                    href="/workflows/lead-scoring"
                    className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                    <h3 className="font-medium text-gray-900">Lead Scoring</h3>
                    <p className="text-sm text-gray-500">Configure scoring rules</p>
                </Link>
                <Link
                    href="/workflows/sla"
                    className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                    <h3 className="font-medium text-gray-900">SLA Management</h3>
                    <p className="text-sm text-gray-500">Manage SLA policies</p>
                </Link>
                <Link
                    href="/workflows/approvals"
                    className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                    <h3 className="font-medium text-gray-900">Approvals</h3>
                    <p className="text-sm text-gray-500">View pending approvals</p>
                </Link>
                <Link
                    href="/workflows/executions"
                    className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                    <h3 className="font-medium text-gray-900">Execution History</h3>
                    <p className="text-sm text-gray-500">View workflow runs</p>
                </Link>
            </div>
        </div>
    );
}
