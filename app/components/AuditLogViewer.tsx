'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LeadDeletionAuditLog, SystemAuditLog, AuditActionType } from '../types/shared';
import { getAuditLogs, exportAuditLogs, clearAuditLogs } from '../utils/storage';
import { useUsers } from '../context/UserContext';

// Category definitions for organized filtering
const ACTION_CATEGORIES = {
    LEAD: ['LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_DELETED', 'LEAD_ASSIGNED', 'LEAD_STATUS_CHANGED', 'LEAD_FORWARDED_TO_PROCESS'],
    CASE: ['CASE_CREATED', 'CASE_UPDATED', 'CASE_DELETED', 'CASE_ASSIGNED', 'CASE_REASSIGNED', 'CASE_STATUS_CHANGED', 'CASE_PRIORITY_CHANGED', 'CASE_BULK_ASSIGNED'],
    USER: ['USER_PASSWORD_CHANGED', 'USER_PASSWORD_RESET_BY_ADMIN', 'USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_ACTIVATED', 'USER_DEACTIVATED'],
    SECURITY: ['ADMIN_IMPERSONATION_STARTED', 'ADMIN_IMPERSONATION_ENDED', 'USER_PASSWORD_CHANGED', 'USER_PASSWORD_RESET_BY_ADMIN', 'USER_LOGIN_FAILED']
};

export default function AuditLogViewer() {
    const [systemLogs, setSystemLogs] = useState<SystemAuditLog[]>([]);
    const [deletionLogs, setDeletionLogs] = useState<LeadDeletionAuditLog[]>([]);
    const [filterAction, setFilterAction] = useState<AuditActionType | 'ALL' | 'DELETIONS'>('ALL');
    const [filterCategory, setFilterCategory] = useState<'ALL' | 'LEAD' | 'CASE' | 'USER' | 'SECURITY'>('ALL');
    const [filterEntity, setFilterEntity] = useState<'all' | 'lead' | 'case' | 'user'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const { canManageUsers } = useUsers();
    const isAdmin = canManageUsers();

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = () => {
        const logs = getAuditLogs();
        setSystemLogs(logs.reverse());

        const deletionLogsJson = localStorage.getItem('leadDeletionAuditLog') || '[]';
        const parsedDeletionLogs = JSON.parse(deletionLogsJson);
        setDeletionLogs(parsedDeletionLogs.reverse());
    };

    const filteredLogs = useMemo(() => {
        let filtered = systemLogs;

        // Filter by category first
        if (filterCategory !== 'ALL') {
            const actions = ACTION_CATEGORIES[filterCategory];
            filtered = filtered.filter(log => actions.includes(log.actionType));
        }

        // Filter by specific action type
        if (filterAction !== 'ALL' && filterAction !== 'DELETIONS') {
            filtered = filtered.filter(log => log.actionType === filterAction);
        }

        // Filter by entity type
        if (filterEntity !== 'all') {
            filtered = filtered.filter(log => log.entityType === filterEntity);
        }

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                log.description.toLowerCase().includes(term) ||
                log.performedByName.toLowerCase().includes(term) ||
                log.entityId.toLowerCase().includes(term) ||
                log.deviceInfo?.toLowerCase().includes(term)
            );
        }

        // Date range filter
        if (dateRange.start) {
            filtered = filtered.filter(log => new Date(log.performedAt) >= new Date(dateRange.start));
        }
        if (dateRange.end) {
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(log => new Date(log.performedAt) <= endDate);
        }

        return filtered;
    }, [systemLogs, filterAction, filterCategory, filterEntity, searchTerm, dateRange]);

    // Statistics by category
    const categoryStats = useMemo(() => {
        const stats: Record<string, number> = { LEAD: 0, CASE: 0, USER: 0, SECURITY: 0 };
        systemLogs.forEach(log => {
            if (ACTION_CATEGORIES.LEAD.includes(log.actionType)) stats.LEAD++;
            if (ACTION_CATEGORIES.CASE.includes(log.actionType)) stats.CASE++;
            if (ACTION_CATEGORIES.USER.includes(log.actionType)) stats.USER++;
            if (ACTION_CATEGORIES.SECURITY.includes(log.actionType)) stats.SECURITY++;
        });
        return stats;
    }, [systemLogs]);

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

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const getActionBadgeColor = (actionType: AuditActionType): string => {
        if (actionType.includes('CREATED')) return 'bg-green-100 text-green-800';
        if (actionType.includes('DELETED')) return 'bg-red-100 text-red-800';
        if (actionType.includes('UPDATED') || actionType.includes('CHANGED')) return 'bg-blue-100 text-blue-800';
        if (actionType.includes('ASSIGNED')) return 'bg-purple-100 text-purple-800';
        if (actionType.includes('LOGIN') && !actionType.includes('FAILED')) return 'bg-indigo-100 text-indigo-800';
        if (actionType.includes('LOGOUT')) return 'bg-gray-100 text-gray-800';
        if (actionType.includes('FAILED')) return 'bg-red-100 text-red-800';
        if (actionType.includes('PASSWORD')) return 'bg-amber-100 text-amber-800';
        if (actionType.includes('IMPERSONATION')) return 'bg-orange-100 text-orange-800';
        return 'bg-gray-100 text-gray-800';
    };

    const getEntityBadgeColor = (entityType: string): string => {
        if (entityType === 'lead') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (entityType === 'case') return 'bg-purple-50 text-purple-700 border-purple-200';
        if (entityType === 'user') return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-gray-50 text-gray-700 border-gray-200';
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">System Audit Log</h2>
                    <p className="text-sm text-gray-500">Track all system activities and security events</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={loadLogs}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Export Logs
                    </button>
                    {isAdmin && (
                        <button
                            onClick={handleClear}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Clear Logs
                        </button>
                    )}
                </div>
            </div>

            {/* Category Stats */}
            <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="text-sm text-gray-600">Total Logs</div>
                    <div className="text-2xl font-bold text-gray-900">{systemLogs.length}</div>
                </div>
                <div
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-pointer transition-colors ${filterCategory === 'LEAD' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                    onClick={() => setFilterCategory(filterCategory === 'LEAD' ? 'ALL' : 'LEAD')}
                >
                    <div className="text-sm text-blue-600">Lead Events</div>
                    <div className="text-2xl font-bold text-blue-700">{categoryStats.LEAD}</div>
                </div>
                <div
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-pointer transition-colors ${filterCategory === 'CASE' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}
                    onClick={() => setFilterCategory(filterCategory === 'CASE' ? 'ALL' : 'CASE')}
                >
                    <div className="text-sm text-purple-600">Case Events</div>
                    <div className="text-2xl font-bold text-purple-700">{categoryStats.CASE}</div>
                </div>
                <div
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-pointer transition-colors ${filterCategory === 'USER' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'}`}
                    onClick={() => setFilterCategory(filterCategory === 'USER' ? 'ALL' : 'USER')}
                >
                    <div className="text-sm text-amber-600">User Events</div>
                    <div className="text-2xl font-bold text-amber-700">{categoryStats.USER}</div>
                </div>
                <div
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-pointer transition-colors ${filterCategory === 'SECURITY' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-red-300'}`}
                    onClick={() => setFilterCategory(filterCategory === 'SECURITY' ? 'ALL' : 'SECURITY')}
                >
                    <div className="text-sm text-red-600">Security Events</div>
                    <div className="text-2xl font-bold text-red-700">{categoryStats.SECURITY}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700">Action Type</label>
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value as any)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-purple-500"
                        >
                            <option value="ALL">All Actions</option>
                            <option value="DELETIONS">— Deletion Logs —</option>
                            <optgroup label="Lead Actions">
                                <option value="LEAD_CREATED">Lead Created</option>
                                <option value="LEAD_UPDATED">Lead Updated</option>
                                <option value="LEAD_DELETED">Lead Deleted</option>
                                <option value="LEAD_ASSIGNED">Lead Assigned</option>
                                <option value="LEAD_STATUS_CHANGED">Lead Status Changed</option>
                                <option value="LEAD_FORWARDED_TO_PROCESS">Lead Forwarded</option>
                            </optgroup>
                            <optgroup label="Case Actions">
                                <option value="CASE_CREATED">Case Created</option>
                                <option value="CASE_UPDATED">Case Updated</option>
                                <option value="CASE_DELETED">Case Deleted</option>
                                <option value="CASE_STATUS_CHANGED">Case Status Changed</option>
                                <option value="CASE_ASSIGNED">Case Assigned</option>
                                <option value="CASE_BULK_ASSIGNED">Case Bulk Assigned</option>
                                <option value="CASE_PRIORITY_CHANGED">Case Priority Changed</option>
                            </optgroup>
                            <optgroup label="User / Security">
                                <option value="USER_CREATED">User Created</option>
                                <option value="USER_UPDATED">User Updated</option>
                                <option value="USER_DELETED">User Deleted</option>
                                <option value="USER_ACTIVATED">User Activated</option>
                                <option value="USER_DEACTIVATED">User Deactivated</option>
                                <option value="USER_PASSWORD_CHANGED">Password Changed</option>
                                <option value="USER_PASSWORD_RESET_BY_ADMIN">Password Reset by Admin</option>
                                <option value="USER_LOGIN">User Login</option>
                                <option value="USER_LOGOUT">User Logout</option>
                                <option value="USER_LOGIN_FAILED">Login Failed</option>
                                <option value="ADMIN_IMPERSONATION_STARTED">Impersonation Started</option>
                                <option value="ADMIN_IMPERSONATION_ENDED">Impersonation Ended</option>
                            </optgroup>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700">Entity Type</label>
                        <select
                            value={filterEntity}
                            onChange={(e) => setFilterEntity(e.target.value as any)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-purple-500"
                        >
                            <option value="all">All Entities</option>
                            <option value="lead">Leads</option>
                            <option value="case">Cases</option>
                            <option value="user">Users</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700">Start Date</label>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700">End Date</label>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700">Search</label>
                        <input
                            type="text"
                            placeholder="Search logs..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400"
                        />
                    </div>
                </div>

                {/* Active Filters */}
                {(filterCategory !== 'ALL' || filterAction !== 'ALL' || filterEntity !== 'all' || searchTerm || dateRange.start || dateRange.end) && (
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <span className="text-sm text-gray-500">Active Filters:</span>
                        {filterCategory !== 'ALL' && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">{filterCategory}</span>
                        )}
                        {filterAction !== 'ALL' && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">{filterAction.replace(/_/g, ' ')}</span>
                        )}
                        {filterEntity !== 'all' && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">{filterEntity}</span>
                        )}
                        <button
                            onClick={() => {
                                setFilterCategory('ALL');
                                setFilterAction('ALL');
                                setFilterEntity('all');
                                setSearchTerm('');
                                setDateRange({ start: '', end: '' });
                            }}
                            className="ml-auto text-xs text-purple-600 hover:text-purple-800"
                        >
                            Clear All
                        </button>
                    </div>
                )}
            </div>

            {/* Result count */}
            <div className="text-sm text-gray-500 mb-4">
                Showing {filteredLogs.length} of {systemLogs.length} logs
            </div>

            {/* Logs Display */}
            <div className="space-y-3">
                {filterAction === 'DELETIONS' ? (
                    deletionLogs.length > 0 ? deletionLogs.map(log => (
                        <div key={log.id} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-500">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="font-semibold text-gray-900">{log.leadData.clientName || log.leadData.kva}</span>
                                    <span className="text-sm text-gray-500 ml-2">({log.leadData.company})</span>
                                </div>
                                <span className="text-xs text-gray-400">{new Date(log.deletedAt).toLocaleString()}</span>
                            </div>
                            <div className="text-sm space-y-1 text-gray-700">
                                <p><strong>Deleted by:</strong> {log.deletedByName}</p>
                                <p><strong>From:</strong> {log.deletedFrom.replace('_', ' ')}</p>
                                <p><strong>Case(s) created:</strong> {log.caseIds.join(', ')}</p>
                                {log.reason && <p><strong>Reason:</strong> {log.reason}</p>}
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-8 text-gray-500">No deletion logs found.</div>
                    )
                ) : filteredLogs.length > 0 ? (
                    filteredLogs.map(log => (
                        <div key={log.id} className={`bg-white p-4 rounded-lg shadow-sm border-l-4 ${ACTION_CATEGORIES.SECURITY.includes(log.actionType) ? 'border-orange-500' :
                            log.entityType === 'user' ? 'border-amber-500' :
                                log.entityType === 'case' ? 'border-purple-500' : 'border-blue-500'
                            }`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionBadgeColor(log.actionType)}`}>
                                        {log.actionType.replace(/_/g, ' ')}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getEntityBadgeColor(log.entityType)}`}>
                                        {log.entityType.toUpperCase()}
                                    </span>
                                    {ACTION_CATEGORIES.SECURITY.includes(log.actionType) && (
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                            SECURITY
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400">{new Date(log.performedAt).toLocaleString()}</span>
                            </div>

                            <p className="font-medium text-gray-900 mb-2">{log.description}</p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-2">
                                <div>
                                    <span className="text-gray-500">Performed by:</span> {log.performedByName}
                                </div>
                                <div>
                                    <span className="text-gray-500">Entity ID:</span> <code className="bg-gray-100 px-1 rounded text-xs">{log.entityId}</code>
                                </div>
                                {log.deviceInfo && (
                                    <div className="col-span-2 text-xs">
                                        <span className="text-gray-500">Device:</span> {log.deviceInfo.substring(0, 80)}...
                                    </div>
                                )}
                            </div>

                            {/* Expandable Details */}
                            {(log.metadata || log.beforeValue || log.afterValue || log.changesSummary) && (
                                <div className="border-t border-gray-100 pt-2 mt-2">
                                    <button
                                        onClick={() => toggleExpand(log.id)}
                                        className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
                                    >
                                        <svg className={`w-4 h-4 transition-transform ${expandedIds.has(log.id) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                        {expandedIds.has(log.id) ? 'Hide Details' : 'Show Details'}
                                    </button>

                                    {expandedIds.has(log.id) && (
                                        <div className="mt-2 space-y-2">
                                            {log.changesSummary && (
                                                <div className="bg-blue-50 p-2 rounded text-sm">
                                                    <strong>Changes:</strong> {log.changesSummary}
                                                </div>
                                            )}
                                            {log.beforeValue && (
                                                <div>
                                                    <div className="text-xs font-medium text-gray-500">Before:</div>
                                                    <pre className="bg-red-50 p-2 rounded text-xs overflow-auto max-h-32">
                                                        {typeof log.beforeValue === 'object' ? JSON.stringify(log.beforeValue, null, 2) : log.beforeValue}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.afterValue && (
                                                <div>
                                                    <div className="text-xs font-medium text-gray-500">After:</div>
                                                    <pre className="bg-green-50 p-2 rounded text-xs overflow-auto max-h-32">
                                                        {typeof log.afterValue === 'object' ? JSON.stringify(log.afterValue, null, 2) : log.afterValue}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                <div>
                                                    <div className="text-xs font-medium text-gray-500">Metadata:</div>
                                                    <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto max-h-32">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        No audit logs found matching the current filters.
                    </div>
                )}
            </div>
        </div>
    );
}
