'use client';

/**
 * Workflow Executions Page
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface Execution {
    id: string;
    status: string;
    entityType: string;
    entityId: string;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
    workflow: { id: string; name: string; triggerType: string };
}

const statusColors: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-800',
    RUNNING: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-600',
    PAUSED: 'bg-yellow-100 text-yellow-800'
};

export default function ExecutionsPage() {
    const searchParams = useSearchParams();
    const [executions, setExecutions] = useState<Execution[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        workflowId: searchParams.get('workflowId') || '',
        status: '',
        entityType: ''
    });
    const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
    const [executionDetail, setExecutionDetail] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        fetchExecutions();
    }, [filter]);

    const fetchExecutions = async () => {
        try {
            const params = new URLSearchParams();
            if (filter.workflowId) params.set('workflowId', filter.workflowId);
            if (filter.status) params.set('status', filter.status);
            if (filter.entityType) params.set('entityType', filter.entityType);

            const res = await fetch(`/api/workflows/executions?${params}`);
            const data = await res.json();
            setExecutions(data.executions || []);
        } catch (error) {
            console.error('Failed to fetch executions:', error);
        } finally {
            setLoading(false);
        }
    };

    const viewExecution = async (id: string) => {
        setSelectedExecution(id);
        const res = await fetch(`/api/workflows/executions/${id}`);
        setExecutionDetail(await res.json());
    };

    const retryExecution = async (id: string) => {
        await fetch(`/api/workflows/executions/${id}`, { method: 'POST' });
        fetchExecutions();
    };

    const formatDate = (date?: string) => date ? new Date(date).toLocaleString() : '-';

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Workflow Executions</h1>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-4">
                <select
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                    className="border rounded px-3 py-2"
                >
                    <option value="">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="RUNNING">Running</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="FAILED">Failed</option>
                    <option value="PAUSED">Paused</option>
                </select>
                <select
                    value={filter.entityType}
                    onChange={(e) => setFilter({ ...filter, entityType: e.target.value })}
                    className="border rounded px-3 py-2"
                >
                    <option value="">All Entities</option>
                    <option value="LEAD">Lead</option>
                    <option value="CASE">Case</option>
                </select>
            </div>

            {/* Executions Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : executions.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No executions found</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Workflow</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Entity</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Started</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Completed</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {executions.map((exec) => (
                                <tr key={exec.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium">{exec.workflow.name}</div>
                                        <div className="text-xs text-gray-500">{exec.workflow.triggerType}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm">{exec.entityType} {exec.entityId.slice(0, 8)}...</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[exec.status]}`}>
                                            {exec.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm">{formatDate(exec.startedAt)}</td>
                                    <td className="px-6 py-4 text-sm">{formatDate(exec.completedAt)}</td>
                                    <td className="px-6 py-4">
                                        <button onClick={() => viewExecution(exec.id)} className="text-blue-600 hover:underline text-sm mr-3">
                                            View
                                        </button>
                                        {exec.status === 'FAILED' && (
                                            <button onClick={() => retryExecution(exec.id)} className="text-green-600 hover:underline text-sm">
                                                Retry
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Detail Modal */}
            {selectedExecution && executionDetail && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-medium">Execution Details</h2>
                            <button onClick={() => { setSelectedExecution(null); setExecutionDetail(null); }}>×</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <div className="text-sm text-gray-600">Status</div>
                                <div className={`inline-block px-2 py-1 text-sm rounded ${statusColors[(executionDetail as Execution).status]}`}>
                                    {(executionDetail as Execution).status}
                                </div>
                            </div>
                            {(executionDetail as Execution).errorMessage && (
                                <div>
                                    <div className="text-sm text-gray-600">Error</div>
                                    <div className="text-red-600">{(executionDetail as Execution).errorMessage}</div>
                                </div>
                            )}
                            <div>
                                <div className="text-sm text-gray-600">Execution Log</div>
                                <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                    {JSON.stringify((executionDetail as Record<string, unknown>).executionLog, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
