'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import { CaseStatusBadge } from '../components/CaseStatusBadge';
import { Case, UserRole, CasePriority, ProcessStatus } from '../types/processTypes';
import * as XLSX from 'xlsx';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate case age in days from creation date
 */
function calculateCaseAge(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffInMs = now.getTime() - created.getTime();
    return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Get color class based on case age
 */
function getAgeColor(days: number): string {
    if (days <= 7) return 'text-green-600';
    if (days <= 14) return 'text-blue-600';
    if (days <= 30) return 'text-orange-600';
    return 'text-red-600';
}

/**
 * Get age display badge text
 */
function getAgeBadge(days: number): string {
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return `${days} days`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch {
        return dateString;
    }
}

// ============================================================================
// STATUS GROUP MAPPING
// ============================================================================

const STATUS_GROUPS = {
    PENDING: ['DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED'] as ProcessStatus[],
    ASSIGNED: ['VERIFICATION', 'SUBMITTED', 'QUERY_RAISED'] as ProcessStatus[],
    COMPLETED: ['APPROVED', 'REJECTED', 'CLOSED'] as ProcessStatus[]
};

// ============================================================================
// PRIORITY BADGE COMPONENT
// ============================================================================

function PriorityBadge({ priority }: { priority: CasePriority }) {
    const config: Record<CasePriority, { bg: string; text: string; label: string }> = {
        URGENT: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
        HIGH: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High' },
        MEDIUM: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Medium' },
        LOW: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Low' }
    };

    const { bg, text, label } = config[priority];

    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
            {label}
        </span>
    );
}

// ============================================================================
// ROLE BADGE COMPONENT
// ============================================================================

function RoleBadge({ role }: { role: UserRole | null }) {
    if (!role) {
        return (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                Unassigned
            </span>
        );
    }

    const config: Partial<Record<UserRole, { bg: string; text: string; label: string }>> = {
        PROCESS_MANAGER: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Process Manager' },
        PROCESS_EXECUTIVE: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Process Executive' }
    };

    const cfg = config[role] || { bg: 'bg-gray-100', text: 'text-gray-600', label: role };

    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
        </span>
    );
}

// ============================================================================
// REASSIGNMENT MODAL COMPONENT
// ============================================================================

interface ReassignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (userId: string, role: UserRole) => void;
    caseNumber: string;
    getUsersByRole: (role: UserRole) => { userId: string; name: string }[];
}

function ReassignModal({ isOpen, onClose, onSubmit, caseNumber, getUsersByRole }: ReassignModalProps) {
    const [selectedRole, setSelectedRole] = useState<UserRole>('PROCESS_EXECUTIVE');
    const [selectedUserId, setSelectedUserId] = useState<string>('');

    const usersForRole = useMemo(() => {
        return getUsersByRole(selectedRole);
    }, [selectedRole, getUsersByRole]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (selectedUserId) {
            onSubmit(selectedUserId, selectedRole);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Reassign Case</h3>
                <p className="text-sm text-gray-500 mb-4">Reassigning case: <strong>{caseNumber}</strong></p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select Role
                        </label>
                        <select
                            value={selectedRole}
                            onChange={(e) => {
                                setSelectedRole(e.target.value as UserRole);
                                setSelectedUserId('');
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        >
                            <option value="PROCESS_MANAGER">Process Manager</option>
                            <option value="PROCESS_EXECUTIVE">Process Executive</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select User
                        </label>
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        >
                            <option value="">Select a user...</option>
                            {usersForRole.map(user => (
                                <option key={user.userId} value={user.userId}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                        {usersForRole.length === 0 && (
                            <p className="text-sm text-amber-600 mt-1">
                                No active users found for this role
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedUserId}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Reassign
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// TOAST NOTIFICATION COMPONENT
// ============================================================================

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}

function Toast({ message, type, onClose }: ToastProps) {
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

    return (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-white shadow-lg ${bgColor}`}>
            <span className="font-bold">{icon}</span>
            <span>{message}</span>
            <button onClick={onClose} className="ml-2 hover:opacity-80">✕</button>
        </div>
    );
}

// ============================================================================
// MAIN PROCESS DASHBOARD COMPONENT
// ============================================================================

export default function ProcessDashboardPage() {
    const router = useRouter();
    const { cases, isLoading, getCaseStats, assignCase } = useCases();
    const { currentUser, getUserById, getUsersByRole } = useUsers();

    // ========================================================================
    // FILTER STATE
    // ========================================================================

    const [searchTerm, setSearchTerm] = useState('');
    const [statusGroupFilter, setStatusGroupFilter] = useState<'ALL' | 'PENDING' | 'ASSIGNED' | 'COMPLETED'>('ALL');
    const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
    const [priorityFilter, setPriorityFilter] = useState<CasePriority | 'ALL'>('ALL');
    const [agingFilter, setAgingFilter] = useState<'ALL' | 'NEW' | '7+' | '14+' | '30+'>('ALL');

    // ========================================================================
    // UI STATE
    // ========================================================================

    const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
    const [reassignModalOpen, setReassignModalOpen] = useState(false);
    const [caseToReassign, setCaseToReassign] = useState<Case | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // ========================================================================
    // PERMISSION CHECKS
    // ========================================================================

    const canReassign = ['ADMIN', 'PROCESS_MANAGER'].includes(currentUser?.role || '');
    const canViewAll = ['ADMIN', 'PROCESS_MANAGER', 'SALES_MANAGER'].includes(currentUser?.role || '');
    const isReadOnly = currentUser?.role === 'SALES_MANAGER';

    // ========================================================================
    // FILTERED CASES
    // ========================================================================

    const filteredCases = useMemo(() => {
        let result = [...cases];

        // Note: All PROCESS roles (PROCESS_EXECUTIVE, PROCESS_MANAGER) and ADMIN can view all cases
        // SALES_MANAGER can view all cases (read-only) - access is controlled via RoleGuard
        // SALES_EXECUTIVE is blocked entirely by RoleGuard

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(c =>
                c.caseNumber?.toLowerCase().includes(term) ||
                c.clientName?.toLowerCase().includes(term) ||
                c.company?.toLowerCase().includes(term) ||
                c.mobileNumber?.includes(term)
            );
        }

        // Status group filter
        if (statusGroupFilter === 'PENDING') {
            result = result.filter(c => STATUS_GROUPS.PENDING.includes(c.processStatus));
        } else if (statusGroupFilter === 'ASSIGNED') {
            result = result.filter(c => STATUS_GROUPS.ASSIGNED.includes(c.processStatus));
        } else if (statusGroupFilter === 'COMPLETED') {
            result = result.filter(c => STATUS_GROUPS.COMPLETED.includes(c.processStatus));
        }

        // Role filter
        if (roleFilter !== 'ALL') {
            result = result.filter(c => c.assignedRole === roleFilter);
        }

        // Priority filter
        if (priorityFilter !== 'ALL') {
            result = result.filter(c => c.priority === priorityFilter);
        }

        // Aging filter
        if (agingFilter !== 'ALL') {
            result = result.filter(c => {
                const age = calculateCaseAge(c.createdAt);
                if (agingFilter === 'NEW') return age <= 7;
                if (agingFilter === '7+') return age > 7 && age <= 14;
                if (agingFilter === '14+') return age > 14 && age <= 30;
                if (agingFilter === '30+') return age > 30;
                return true;
            });
        }

        // Sort by updated date (most recent first)
        result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        return result;
    }, [cases, searchTerm, statusGroupFilter, roleFilter, priorityFilter, agingFilter]);

    // ========================================================================
    // STATISTICS
    // ========================================================================

    const stats = useMemo(() => getCaseStats(), [getCaseStats]);

    const agingCasesCount = useMemo(() => {
        return filteredCases.filter(c => calculateCaseAge(c.createdAt) > 14).length;
    }, [filteredCases]);

    const summaryCards = useMemo(() => [
        {
            label: 'Total Cases',
            value: stats.total,
            icon: '📊',
            gradient: 'from-purple-500 to-purple-600',
            lightBg: 'bg-purple-50',
            hoverBg: 'hover:bg-purple-100'
        },
        {
            label: 'Pending',
            value: (stats.byStatus.DOCUMENTS_PENDING || 0) + (stats.byStatus.DOCUMENTS_RECEIVED || 0),
            icon: '⏳',
            gradient: 'from-amber-500 to-amber-600',
            lightBg: 'bg-amber-50',
            hoverBg: 'hover:bg-amber-100'
        },
        {
            label: 'In Progress',
            value: (stats.byStatus.VERIFICATION || 0) + (stats.byStatus.SUBMITTED || 0) + (stats.byStatus.QUERY_RAISED || 0),
            icon: '🔄',
            gradient: 'from-blue-500 to-blue-600',
            lightBg: 'bg-blue-50',
            hoverBg: 'hover:bg-blue-100'
        },
        {
            label: 'Completed',
            value: (stats.byStatus.APPROVED || 0) + (stats.byStatus.REJECTED || 0) + (stats.byStatus.CLOSED || 0),
            icon: '✅',
            gradient: 'from-green-500 to-green-600',
            lightBg: 'bg-green-50',
            hoverBg: 'hover:bg-green-100'
        },
        {
            label: 'High Priority',
            value: (stats.byPriority.HIGH || 0) + (stats.byPriority.URGENT || 0),
            icon: '🔥',
            gradient: 'from-red-500 to-red-600',
            lightBg: 'bg-red-50',
            hoverBg: 'hover:bg-red-100'
        },
        {
            label: 'Aging Alert',
            value: agingCasesCount,
            icon: '⚠️',
            gradient: 'from-orange-500 to-orange-600',
            lightBg: 'bg-orange-50',
            hoverBg: 'hover:bg-orange-100'
        }
    ], [stats, agingCasesCount]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const handleRowClick = useCallback((caseData: Case, e: React.MouseEvent) => {
        // Don't navigate if clicking on action buttons
        if ((e.target as HTMLElement).closest('button')) return;
        router.push(`/case-details?id=${caseData.caseId}`);
    }, [router]);

    const handleReassignClick = useCallback((caseData: Case, e: React.MouseEvent) => {
        e.stopPropagation();
        setCaseToReassign(caseData);
        setReassignModalOpen(true);
    }, []);

    const handleReassignSubmit = useCallback((userId: string, role: UserRole) => {
        if (!caseToReassign) return;

        const result = assignCase(caseToReassign.caseId, userId, role);
        if (result.success) {
            showToast('Case reassigned successfully!', 'success');
        } else {
            showToast(result.message || 'Failed to reassign case', 'error');
        }

        setReassignModalOpen(false);
        setCaseToReassign(null);
    }, [caseToReassign, assignCase, showToast]);

    const handleExport = useCallback(() => {
        try {
            const exportData = filteredCases.map(c => {
                const assignedUser = c.assignedProcessUserId ? getUserById(c.assignedProcessUserId) : null;
                return {
                    'Case Number': c.caseNumber,
                    'Client Name': c.clientName,
                    'Company': c.company,
                    'Mobile': c.mobileNumber,
                    'Status': c.processStatus,
                    'Priority': c.priority,
                    'Assigned Role': c.assignedRole || '—',
                    'Assigned To': assignedUser?.name || '—',
                    'Age (Days)': calculateCaseAge(c.createdAt),
                    'Created Date': formatDate(c.createdAt),
                    'Last Updated': formatDate(c.updatedAt)
                };
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, 'Process Cases');
            XLSX.writeFile(wb, `process-cases-${new Date().toISOString().split('T')[0]}.xlsx`);

            showToast(`Exported ${filteredCases.length} cases successfully!`, 'success');
        } catch (error) {
            console.error('Export error:', error);
            showToast('Failed to export cases', 'error');
        }
    }, [filteredCases, getUserById, showToast]);

    const handleSelectAll = useCallback((checked: boolean) => {
        if (checked) {
            setSelectedCases(new Set(filteredCases.map(c => c.caseId)));
        } else {
            setSelectedCases(new Set());
        }
    }, [filteredCases]);

    const handleSelectCase = useCallback((caseId: string, checked: boolean) => {
        setSelectedCases(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(caseId);
            } else {
                newSet.delete(caseId);
            }
            return newSet;
        });
    }, []);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <RoleGuard
            allowedRoles={['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE', 'SALES_MANAGER']}
            fallback={<AccessDenied />}
        >
            <div className="flex flex-col h-full min-h-screen bg-gray-50">
                {/* Header Section */}
                <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Process Dashboard</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Manage and track all process cases in one place
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {isReadOnly && (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                                    View Only
                                </span>
                            )}
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export
                            </button>
                        </div>
                    </div>
                </div>

                {/* Read-only Banner for SALES_MANAGER */}
                {isReadOnly && (
                    <div className="flex-shrink-0 px-6 py-3 bg-blue-50 border-b border-blue-200">
                        <p className="text-sm text-blue-700">
                            <strong>View Only Mode:</strong> You can view process cases but cannot modify or reassign them.
                        </p>
                    </div>
                )}

                {/* Summary Cards Section */}
                <div className="flex-shrink-0 px-6 py-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {summaryCards.map((card, index) => (
                            <div
                                key={index}
                                className={`${card.lightBg} ${card.hoverBg} rounded-xl p-4 transition-all duration-200 cursor-default border border-gray-100 shadow-sm hover:shadow-md`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-2xl">{card.icon}</span>
                                </div>
                                <div className={`text-2xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                                    {card.value}
                                </div>
                                <div className="text-xs text-gray-600 font-medium mt-1">
                                    {card.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Filters Section */}
                <div className="flex-shrink-0 px-6 py-4 bg-white border-y border-gray-200">
                    <div className="flex flex-wrap gap-3 items-center">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px] max-w-md">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by case number, client, company, mobile..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                            </div>
                        </div>

                        {/* Status Group Filter */}
                        <select
                            value={statusGroupFilter}
                            onChange={(e) => setStatusGroupFilter(e.target.value as any)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                        >
                            <option value="ALL">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="ASSIGNED">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                        </select>

                        {/* Role Filter */}
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as any)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                        >
                            <option value="ALL">All Roles</option>
                            <option value="PROCESS_MANAGER">Process Manager</option>
                            <option value="PROCESS_EXECUTIVE">Process Executive</option>
                        </select>

                        {/* Priority Filter */}
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value as any)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                        >
                            <option value="ALL">All Priority</option>
                            <option value="URGENT">Urgent</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                        </select>

                        {/* Aging Filter */}
                        <select
                            value={agingFilter}
                            onChange={(e) => setAgingFilter(e.target.value as any)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                        >
                            <option value="ALL">All Ages</option>
                            <option value="NEW">New (≤7 days)</option>
                            <option value="7+">7-14 days</option>
                            <option value="14+">14-30 days</option>
                            <option value="30+">30+ days</option>
                        </select>

                        {/* Clear Filters */}
                        {(searchTerm || statusGroupFilter !== 'ALL' || roleFilter !== 'ALL' || priorityFilter !== 'ALL' || agingFilter !== 'ALL') && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusGroupFilter('ALL');
                                    setRoleFilter('ALL');
                                    setPriorityFilter('ALL');
                                    setAgingFilter('ALL');
                                }}
                                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </div>
                )}

                {/* Data Table Section */}
                {!isLoading && (
                    <div className="flex-1 overflow-auto px-6 py-4">
                        {filteredCases.length === 0 ? (
                            /* Empty State */
                            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No cases found</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    {searchTerm || statusGroupFilter !== 'ALL' || roleFilter !== 'ALL' || priorityFilter !== 'ALL' || agingFilter !== 'ALL'
                                        ? 'Try adjusting your filters'
                                        : 'No process cases available yet'}
                                </p>
                            </div>
                        ) : (
                            /* Table */
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-200">
                                                <th className="px-4 py-3 text-left">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCases.size === filteredCases.length && filteredCases.length > 0}
                                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Case Number
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Client
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Source
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Assigned Role
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Assigned User
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Status
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Priority
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Age
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Last Updated
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredCases.map((caseData, index) => {
                                                const age = calculateCaseAge(caseData.createdAt);
                                                const isNew = age === 0;
                                                const assignedUser = caseData.assignedProcessUserId
                                                    ? getUserById(caseData.assignedProcessUserId)
                                                    : null;

                                                return (
                                                    <tr
                                                        key={caseData.caseId}
                                                        onClick={(e) => handleRowClick(caseData, e)}
                                                        className={`hover:bg-purple-50 cursor-pointer transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedCases.has(caseData.caseId)}
                                                                onChange={(e) => handleSelectCase(caseData.caseId, e.target.checked)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-gray-900">
                                                                    {caseData.caseNumber}
                                                                </span>
                                                                {isNew && (
                                                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                                                                        NEW
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div>
                                                                <div className="font-medium text-gray-900">
                                                                    {caseData.clientName || '—'}
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    {caseData.mobileNumber || '—'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${caseData.leadId ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                {caseData.leadId ? 'Sales' : 'Direct'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <RoleBadge role={caseData.assignedRole} />
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-600">
                                                            {assignedUser?.name || '—'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <CaseStatusBadge status={caseData.processStatus} size="sm" />
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <PriorityBadge priority={caseData.priority} />
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`font-medium ${getAgeColor(age)}`}>
                                                                {getAgeBadge(age)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-600">
                                                            {formatDate(caseData.updatedAt)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push(`/case-details?id=${caseData.caseId}`);
                                                                    }}
                                                                    className="px-2 py-1 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
                                                                >
                                                                    View
                                                                </button>
                                                                {canReassign && !isReadOnly && (
                                                                    <button
                                                                        onClick={(e) => handleReassignClick(caseData, e)}
                                                                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                                                    >
                                                                        Reassign
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Table Footer */}
                                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
                                    Showing {filteredCases.length} of {cases.length} cases
                                    {selectedCases.size > 0 && (
                                        <span className="ml-2 text-purple-600 font-medium">
                                            ({selectedCases.size} selected)
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Reassignment Modal */}
                <ReassignModal
                    isOpen={reassignModalOpen}
                    onClose={() => {
                        setReassignModalOpen(false);
                        setCaseToReassign(null);
                    }}
                    onSubmit={handleReassignSubmit}
                    caseNumber={caseToReassign?.caseNumber || ''}
                    getUsersByRole={(role) => getUsersByRole(role).map(u => ({ userId: u.userId, name: u.name }))}
                />

                {/* Toast Notification */}
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </div>
        </RoleGuard>
    );
}
