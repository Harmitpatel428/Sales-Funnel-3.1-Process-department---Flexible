'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LeadDeletionAuditLog, SystemAuditLog, AuditActionType } from '../types/shared';
import { getAuditLogs, exportAuditLogs, clearAuditLogs } from '../utils/storage';
import { useUsers } from '../context/UserContext';

export default function AuditLogViewer() {
    const [systemLogs, setSystemLogs] = useState<SystemAuditLog[]>([]);
    const [deletionLogs, setDeletionLogs] = useState<LeadDeletionAuditLog[]>([]);
    const [filterAction, setFilterAction] = useState<AuditActionType | 'ALL' | 'DELETIONS'>('ALL');
    const [filterEntity, setFilterEntity] = useState<'all' | 'lead' | 'case'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const { currentUser, canManageUsers } = useUsers();
    // Use canManageUsers() which returns boolean, or check role directly. 
    // The plan uses canManageUsers() then assigns to isAdmin. 
    // Assuming canManageUsers() returns true for admins.
    const isAdmin = canManageUsers();

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = () => {
        // Load system audit logs
        const logs = getAuditLogs();
        setSystemLogs(logs.reverse()); // Newest first

        // Load deletion logs
        const deletionLogsJson = localStorage.getItem('leadDeletionAuditLog') || '[]';
        const parsedDeletionLogs = JSON.parse(deletionLogsJson);
        setDeletionLogs(parsedDeletionLogs.reverse());
    };

    const filteredLogs = useMemo(() => {
        let filtered = systemLogs;

        // Filter by action type
        if (filterAction !== 'ALL' && filterAction !== 'DELETIONS') {
            filtered = filtered.filter(log => log.actionType === filterAction);
        }

        // Filter by entity type
        if (filterEntity !== 'all') {
            filtered = filtered.filter(log => log.entityType === filterEntity);
        }

        // Filter by search term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                log.description.toLowerCase().includes(term) ||
                log.performedByName.toLowerCase().includes(term) ||
                log.entityId.toLowerCase().includes(term)
            );
        }

        // Filter by date range
        if (dateRange.start) {
            filtered = filtered.filter(log =>
                new Date(log.performedAt) >= new Date(dateRange.start)
            );
        }
        if (dateRange.end) {
            filtered = filtered.filter(log =>
                new Date(log.performedAt) <= new Date(dateRange.end)
            );
        }

        return filtered;
    }, [systemLogs, filterAction, filterEntity, searchTerm, dateRange]);

    const handleExport = () => {
        const data = exportAuditLogs();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-complete-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClear = () => {
        if (!isAdmin) {
            alert('Only admins can clear audit logs');
            return;
        }
        if (confirm('Are you sure you want to clear all audit logs? This action cannot be undone.')) {
            clearAuditLogs();
            loadLogs();
        }
    };

    const getActionBadgeColor = (actionType: AuditActionType): string => {
        if (actionType.includes('CREATED')) return 'bg-green-100 text-green-800';
        if (actionType.includes('UPDATED')) return 'bg-blue-100 text-blue-800';
        if (actionType.includes('DELETED')) return 'bg-red-100 text-red-800';
        if (actionType.includes('ASSIGNED')) return 'bg-purple-100 text-purple-800';
        if (actionType.includes('STATUS')) return 'bg-yellow-100 text-yellow-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">System Audit Log</h2>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Export Logs
                    </button>
                    {isAdmin && (
                        <button
                            onClick={handleClear}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                            Clear Logs
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow mb-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Action Type</label>
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value as any)}
                            className="w-full border rounded px-3 py-2"
                        >
                            <option value="ALL">All Actions</option>
                            <option value="DELETIONS">Deletion Logs</option>
                            <option value="LEAD_CREATED">Lead Created</option>
                            <option value="LEAD_UPDATED">Lead Updated</option>
                            <option value="LEAD_ASSIGNED">Lead Assigned</option>
                            <option value="LEAD_FORWARDED_TO_PROCESS">Lead Forwarded</option>
                            <option value="CASE_CREATED">Case Created</option>
                            <option value="CASE_UPDATED">Case Updated</option>
                            <option value="CASE_STATUS_CHANGED">Case Status Changed</option>
                            <option value="CASE_ASSIGNED">Case Assigned</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Entity Type</label>
                        <select
                            value={filterEntity}
                            onChange={(e) => setFilterEntity(e.target.value as any)}
                            className="w-full border rounded px-3 py-2"
                        >
                            <option value="all">All</option>
                            <option value="lead">Leads</option>
                            <option value="case">Cases</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Start Date</label>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">End Date</label>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Search</label>
                    <input
                        type="text"
                        placeholder="Search by description, user, or entity ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Total Logs</div>
                    <div className="text-2xl font-bold">{systemLogs.length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Filtered Logs</div>
                    <div className="text-2xl font-bold">{filteredLogs.length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Deletion Logs</div>
                    <div className="text-2xl font-bold">{deletionLogs.length}</div>
                </div>
            </div>

            {/* Logs Display */}
            <div className="space-y-3">
                {filterAction === 'DELETIONS' ? (
                    // Show deletion logs
                    deletionLogs.map(log => (
                        <div key={log.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="font-semibold">{log.leadData.clientName || log.leadData.kva}</span>
                                    <span className="text-sm text-gray-500 ml-2">({log.leadData.company})</span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(log.deletedAt).toLocaleString()}
                                </span>
                            </div>
                            <div className="text-sm space-y-1">
                                <p><strong>Deleted by:</strong> {log.deletedByName}</p>
                                <p><strong>From:</strong> {log.deletedFrom.replace('_', ' ')}</p>
                                <p><strong>Case(s) created:</strong> {log.caseIds.join(', ')}</p>
                                {log.reason && <p><strong>Reason:</strong> {log.reason}</p>}
                            </div>
                        </div>
                    ))
                ) : (
                    // Show system logs
                    filteredLogs.map(log => (
                        <div key={log.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getActionBadgeColor(log.actionType)}`}>
                                        {log.actionType.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                        {log.entityType.toUpperCase()}
                                    </span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(log.performedAt).toLocaleString()}
                                </span>
                            </div>
                            <div className="text-sm space-y-1">
                                <p className="font-medium">{log.description}</p>
                                <p className="text-gray-600">
                                    <strong>Performed by:</strong> {log.performedByName}
                                </p>
                                <p className="text-gray-600">
                                    <strong>Entity ID:</strong> <code className="bg-gray-100 px-1 rounded">{log.entityId}</code>
                                </p>
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                                            View Metadata
                                        </summary>
                                        <pre className="mt-2 bg-gray-50 p-2 rounded text-xs overflow-auto">
                                            {JSON.stringify(log.metadata, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {filteredLogs.length === 0 && filterAction !== 'DELETIONS' && (
                <div className="text-center py-8 text-gray-500">
                    No audit logs found matching the current filters.
                </div>
            )}

            {deletionLogs.length === 0 && filterAction === 'DELETIONS' && (
                <div className="text-center py-8 text-gray-500">
                    No deletion logs found.
                </div>
            )}
        </div>
    );
}
