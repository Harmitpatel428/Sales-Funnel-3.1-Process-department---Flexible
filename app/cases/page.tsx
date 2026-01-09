'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import { CaseStatusBadge } from '../components/CaseStatusBadge';
import DeleteConfirmModal from '../components/DeleteConfirmModal'; // Using Dashboard's modal for consistency
import { Case, UserRole, CasePriority, ProcessStatus } from '../types/processTypes';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function calculateCaseAge(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffInMs = now.getTime() - created.getTime();
    return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

function getAgeColor(days: number): string {
    if (days <= 7) return 'text-green-600';
    if (days <= 14) return 'text-blue-600';
    if (days <= 30) return 'text-orange-600';
    return 'text-red-600';
}

function getAgeBadge(days: number): string {
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return `${days} days`;
}

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
// BADGE COMPONENTS
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
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${bg} ${text}`}>
            {label}
        </span>
    );
}

function RoleBadge({ role }: { role: UserRole | null }) {
    if (!role) {
        return (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
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
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
        </span>
    );
}

// ============================================================================
// REASSIGNMENT MODAL COMPONENT (Bulk Capable)
// ============================================================================

import ReassignModal from '../components/ReassignModal';

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
// MAIN CASES PAGE COMPONENT
// ============================================================================

export default function CasesPage() {
    const router = useRouter();
    const { cases, isLoading, assignCase, bulkAssignCases, deleteCase } = useCases();
    const { currentUser, getUserById, getUsersByRole, canAssignBenefitTypes } = useUsers();

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
    const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

    // Modal States
    const [reassignModalOpen, setReassignModalOpen] = useState(false);
    const [isReassigningBulk, setIsReassigningBulk] = useState(false); // To distinguish single vs bulk
    const [caseToReassign, setCaseToReassign] = useState<Case | null>(null);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // ========================================================================
    // PERMISSION CHECKS
    // ========================================================================

    const canReassign = canAssignBenefitTypes();
    const isReadOnly = currentUser?.role === 'SALES_MANAGER';

    // Visibility scope indicator for PROCESS_EXECUTIVE
    const isProcessExecutive = currentUser?.role === 'PROCESS_EXECUTIVE';
    const visibilityScopeMessage = isProcessExecutive
        ? `Showing only cases assigned to you (${cases.length} total)`
        : null;

    // ========================================================================
    // FILTERED CASES
    // ========================================================================

    const filteredCases = useMemo(() => {
        let result = [...cases];

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

    // Clear selections when filters change or data refreshes
    React.useEffect(() => {
        setSelectedCases(new Set());
    }, [cases, searchTerm, statusGroupFilter, roleFilter, priorityFilter, agingFilter]);

    // ========================================================================
    // GROUPED CASES
    // ========================================================================

    const groupedCases = useMemo(() => {
        const groups = new Map<string, Case[]>();

        filteredCases.forEach(c => {
            const company = c.company || 'Unknown Company';
            if (!groups.has(company)) {
                groups.set(company, []);
            }
            groups.get(company)!.push(c);
        });

        const result = Array.from(groups.entries()).map(([companyName, cases]) => {
            const statusCounts = {
                PENDING: 0,
                IN_PROGRESS: 0,
                COMPLETED: 0
            };

            cases.forEach(c => {
                if (STATUS_GROUPS.PENDING.includes(c.processStatus)) statusCounts.PENDING++;
                else if (STATUS_GROUPS.ASSIGNED.includes(c.processStatus)) statusCounts.IN_PROGRESS++;
                else if (STATUS_GROUPS.COMPLETED.includes(c.processStatus)) statusCounts.COMPLETED++;
            });

            const latestUpdate = cases.reduce((latest, c) => {
                return new Date(c.updatedAt) > new Date(latest) ? c.updatedAt : latest;
            }, cases[0]?.updatedAt || new Date().toISOString());

            return {
                companyName,
                cases,
                stats: {
                    total: cases.length,
                    ...statusCounts
                },
                latestUpdate
            };
        });

        // Sort companies by latest update
        return result.sort((a, b) => new Date(b.latestUpdate).getTime() - new Date(a.latestUpdate).getTime());
    }, [filteredCases]);

    const toggleCompanyExpansion = useCallback((companyName: string) => {
        setExpandedCompanies(prev => {
            const next = new Set(prev);
            if (next.has(companyName)) {
                next.delete(companyName);
            } else {
                next.add(companyName);
            }
            return next;
        });
    }, []);

    // ========================================================================
    // STATISTICS
    // ========================================================================

    const summaryStats = useMemo(() => {
        let pending = 0;
        let inProgress = 0;
        let completed = 0;

        filteredCases.forEach(c => {
            if (STATUS_GROUPS.PENDING.includes(c.processStatus)) pending++;
            else if (STATUS_GROUPS.ASSIGNED.includes(c.processStatus)) inProgress++;
            else if (STATUS_GROUPS.COMPLETED.includes(c.processStatus)) completed++;
        });

        return {
            total: filteredCases.length,
            totalCompanies: groupedCases.length,
            companiesWithUnassigned: groupedCases.filter(g => g.cases.some(c => !c.assignedProcessUserId)).length,
            pending,
            inProgress,
            completed
        };
    }, [filteredCases, groupedCases]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const handleRowClick = useCallback((caseData: Case, e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
        router.push(`/case-details?id=${caseData.caseId}`);
    }, [router]);

    // Reassign Handlers
    const handleReassignClick = useCallback((caseData: Case, e: React.MouseEvent) => {
        e.stopPropagation();
        setCaseToReassign(caseData);
        setIsReassigningBulk(false);
        setReassignModalOpen(true);
    }, []);

    const handleBulkReassignClick = useCallback(() => {
        if (selectedCases.size === 0) return;
        setIsReassigningBulk(true);
        setCaseToReassign(null);
        setReassignModalOpen(true);
    }, [selectedCases.size]);

    const handleReassignSubmit = useCallback((userId: string, role: UserRole) => {
        if (isReassigningBulk) {
            const result = bulkAssignCases(Array.from(selectedCases), userId, role);
            if (result.success) {
                showToast(result.message, 'success');
                setSelectedCases(new Set());
            } else {
                showToast(result.message, 'error');
            }
        } else {
            // Single Reassign
            if (!caseToReassign) return;
            const result = assignCase(caseToReassign.caseId, userId, role);
            if (result.success) {
                showToast('Case reassigned successfully!', 'success');
            } else {
                showToast(result.message || 'Failed to reassign case', 'error');
            }
        }

        setReassignModalOpen(false);
        setCaseToReassign(null);
        setIsReassigningBulk(false);
    }, [isReassigningBulk, selectedCases, caseToReassign, assignCase, bulkAssignCases, showToast]);

    // Delete Handlers
    const handleDeleteClick = useCallback((caseData: Case, e: React.MouseEvent) => {
        e.stopPropagation();
        setCaseToDelete(caseData);
        setDeleteModalOpen(true);
    }, []);

    const handleMassDeleteClick = useCallback(() => {
        if (selectedCases.size === 0) return;
        setDeleteModalOpen(true);
    }, [selectedCases.size]);

    const handleDeleteConfirm = useCallback(() => {
        if (!caseToDelete && selectedCases.size > 0) {
            // Mass delete
            let successCount = 0;
            let failCount = 0;
            selectedCases.forEach(caseId => {
                const result = deleteCase(caseId);
                if (result.success) successCount++;
                else failCount++;
            });
            if (failCount === 0) {
                showToast(`Deleted ${successCount} case(s) successfully!`, 'success');
            } else {
                showToast(`Deleted ${successCount} case(s), ${failCount} failed`, 'error');
            }
            setSelectedCases(new Set());
            setDeleteModalOpen(false);
            return;
        }

        // Single delete
        if (!caseToDelete) return;
        const result = deleteCase(caseToDelete.caseId);
        if (result.success) {
            showToast('Case deleted successfully!', 'success');
            setSelectedCases(prev => {
                const ns = new Set(prev);
                ns.delete(caseToDelete.caseId);
                return ns;
            });
        } else {
            showToast(result.message || 'Failed to delete case', 'error');
        }

        setDeleteModalOpen(false);
        setCaseToDelete(null);
    }, [caseToDelete, selectedCases, deleteCase, showToast]);

    // Export Handler
    const handleExport = useCallback(async () => {
        try {
            // Dynamically import XLSX to reduce initial bundle size
            const XLSX = await import('xlsx');

            const exportData: any[] = [];
            groupedCases.forEach(group => {
                group.cases.forEach(c => {
                    const assignedUser = c.assignedProcessUserId ? getUserById(c.assignedProcessUserId) : null;
                    exportData.push({
                        'Company Group': group.companyName,
                        'Case Number': c.caseNumber,
                        'Company Name': c.company,
                        'Benefit Type': c.benefitTypes?.[0] || '—',
                        'Client Name': c.clientName,
                        'Mobile': c.mobileNumber,
                        'Status': c.processStatus,
                        'Priority': c.priority,
                        'Assigned Role': c.assignedRole || '—',
                        'Assigned To': assignedUser?.name || '—',
                        'Age (Days)': calculateCaseAge(c.createdAt),
                        'Created Date': formatDate(c.createdAt),
                        'Last Updated': formatDate(c.updatedAt)
                    });
                });
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, 'Process Cases');
            XLSX.writeFile(wb, `process-cases-${new Date().toISOString().split('T')[0]}.xlsx`);

            showToast(`Exported ${filteredCases.length} cases from ${groupedCases.length} companies successfully!`, 'success');
        } catch (error) {
            console.error('Export error:', error);
            showToast('Failed to export cases', 'error');
        }
    }, [filteredCases, groupedCases, getUserById, showToast]);

    // Selection Handlers
    const handleSelectAll = useCallback((checked: boolean) => {
        if (checked) {
            setSelectedCases(new Set(filteredCases.map(c => c.caseId)));
        } else {
            setSelectedCases(new Set());
        }
    }, [filteredCases]);

    const handleSelectCompany = useCallback((cases: Case[], checked: boolean) => {
        setSelectedCases(prev => {
            const newSet = new Set(prev);
            cases.forEach(c => {
                if (checked) newSet.add(c.caseId);
                else newSet.delete(c.caseId);
            });
            return newSet;
        });
    }, []);

    const handleSelectCase = useCallback((caseId: string, checked: boolean) => {
        setSelectedCases(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(caseId);
            else newSet.delete(caseId);
            return newSet;
        });
    }, []);

    return (
        <RoleGuard
            allowedRoles={['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE', 'SALES_MANAGER']}
            fallback={<AccessDenied />}
        >
            <div className="flex flex-col h-full min-h-screen bg-gray-50">
                {/* Header Section */}
                <div className="flex-shrink-0 px-4 py-1.5 bg-white border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-semibold text-gray-900">Case Management</h1>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">{cases.length} cases</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {isReadOnly && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    View Only
                                </span>
                            )}

                            {/* Bulk Actions */}
                            {canReassign && !isReadOnly && selectedCases.size > 0 && (
                                <>
                                    <button
                                        onClick={handleBulkReassignClick}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        Reassign ({selectedCases.size})
                                    </button>
                                    <button
                                        onClick={handleMassDeleteClick}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete ({selectedCases.size})
                                    </button>
                                </>
                            )}

                            <button
                                onClick={handleExport}
                                className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export
                            </button>
                        </div>
                    </div>
                </div>

                {/* Read-only Banner for SALES_MANAGER */}
                {isReadOnly && (
                    <div className="flex-shrink-0 px-4 py-1 bg-blue-50 border-b border-blue-200">
                        <p className="text-xs text-blue-700">
                            <strong>View Only:</strong> You can view but cannot modify cases.
                        </p>
                    </div>
                )}

                {/* Visibility Scope Banner for PROCESS_EXECUTIVE */}
                {isProcessExecutive && (
                    <div className="flex-shrink-0 px-4 py-1.5 bg-purple-50 border-b border-purple-200">
                        <div className="flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <p className="text-xs text-purple-700">
                                <strong>Filtered View:</strong> {visibilityScopeMessage}. You cannot see unassigned cases or cases assigned to other users.
                            </p>
                        </div>
                    </div>
                )}

                {/* Stats Cards */}
                <div className="flex-shrink-0 px-4 py-2">
                    <div className="grid grid-cols-4 gap-1.5">
                        <div className="bg-white rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900 leading-tight">{summaryStats.totalCompanies} <span className="text-sm font-normal text-gray-500">({summaryStats.total})</span></p>
                                <p className="text-xs text-gray-500 leading-tight">Companies (Cases)</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900 leading-tight">{summaryStats.pending}</p>
                                <p className="text-xs text-gray-500 leading-tight">Pending</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900 leading-tight">{summaryStats.inProgress}</p>
                                <p className="text-xs text-gray-500 leading-tight">In Progress</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900 leading-tight">{summaryStats.completed}</p>
                                <p className="text-xs text-gray-500 leading-tight">Completed</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters Section */}
                <div className="flex-shrink-0 px-4 py-2.5 bg-white border-y border-gray-200">
                    <div className="flex flex-wrap gap-2 items-center">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px] max-w-md">
                            <div className="relative">
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by client, company, mobile..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder:text-black"
                                />
                            </div>
                        </div>

                        {/* Status Group Filter */}
                        <select
                            value={statusGroupFilter}
                            onChange={(e) => setStatusGroupFilter(e.target.value as any)}
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-black"
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
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-black"
                        >
                            <option value="ALL">All Roles</option>
                            <option value="PROCESS_MANAGER">Process Manager</option>
                            <option value="PROCESS_EXECUTIVE">Process Executive</option>
                        </select>

                        {/* Priority Filter */}
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value as any)}
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-black"
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
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-black"
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
                                className="px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
                    <div className="flex-1 overflow-auto px-4 py-3">
                        {filteredCases.length === 0 ? (
                            /* Empty State */
                            <div className="text-center py-8 bg-white rounded-xl shadow-sm border border-gray-200">
                                <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <h3 className="mt-2 text-xs font-medium text-gray-900">No cases found</h3>
                                <p className="mt-1 text-xs text-gray-500">
                                    {searchTerm || statusGroupFilter !== 'ALL' || roleFilter !== 'ALL' || priorityFilter !== 'ALL' || agingFilter !== 'ALL'
                                        ? 'Try adjusting your filters'
                                        : isProcessExecutive
                                            ? 'No cases have been assigned to you yet'
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
                                                <th className="px-3 py-2 text-left w-8">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCases.size === filteredCases.length && filteredCases.length > 0}
                                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                                                    Company / Benefit Type
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-24">
                                                    Source
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-32">
                                                    Assigned Role
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-32">
                                                    Assigned User
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-24">
                                                    Status
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-20">
                                                    Priority
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-20">
                                                    Age
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-24">
                                                    Last Updated
                                                </th>
                                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide w-20">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {groupedCases.map((group) => {
                                                const isExpanded = expandedCompanies.has(group.companyName);
                                                const isFullySelected = group.cases.every(c => selectedCases.has(c.caseId));
                                                const isPartiallySelected = !isFullySelected && group.cases.some(c => selectedCases.has(c.caseId));

                                                return (
                                                    <React.Fragment key={group.companyName}>
                                                        {/* Company Parent Row */}
                                                        <tr
                                                            className={`cursor-pointer transition-colors ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                                                            onClick={() => toggleCompanyExpansion(group.companyName)}
                                                        >
                                                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isFullySelected}
                                                                    ref={input => {
                                                                        if (input) input.indeterminate = isPartiallySelected;
                                                                    }}
                                                                    onChange={(e) => handleSelectCompany(group.cases, e.target.checked)}
                                                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                                />
                                                            </td>
                                                            <td colSpan={9} className="px-3 py-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-1 rounded bg-gray-200 text-gray-600">
                                                                        {isExpanded ? (
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                            </svg>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex items-center gap-3">
                                                                        <span className="font-semibold text-sm text-gray-900">{group.companyName}</span>
                                                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                                                                            {group.stats.total} cases
                                                                        </span>
                                                                    </div>

                                                                    <div className="flex items-center gap-2 ml-4 border-l border-gray-300 pl-4">
                                                                        {group.stats.PENDING > 0 && (
                                                                            <div className="flex items-center gap-1" title="Pending">
                                                                                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                                                <span className="text-xs text-gray-600">{group.stats.PENDING}</span>
                                                                            </div>
                                                                        )}
                                                                        {group.stats.IN_PROGRESS > 0 && (
                                                                            <div className="flex items-center gap-1" title="In Progress">
                                                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                                                <span className="text-xs text-gray-600">{group.stats.IN_PROGRESS}</span>
                                                                            </div>
                                                                        )}
                                                                        {group.stats.COMPLETED > 0 && (
                                                                            <div className="flex items-center gap-1" title="Completed">
                                                                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                                                <span className="text-xs text-gray-600">{group.stats.COMPLETED}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="ml-auto text-xs text-gray-500">
                                                                        Latest update: {formatDate(group.latestUpdate)}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {/* Child Rows */}
                                                        {isExpanded && group.cases.map((caseData) => {
                                                            const age = calculateCaseAge(caseData.createdAt);
                                                            const assignedUser = caseData.assignedProcessUserId
                                                                ? getUserById(caseData.assignedProcessUserId)
                                                                : null;

                                                            const isAssignedToCurrentUser = caseData.assignedProcessUserId === currentUser?.userId;

                                                            return (
                                                                <tr
                                                                    key={caseData.caseId}
                                                                    onClick={(e) => handleRowClick(caseData, e)}
                                                                    className={`bg-white hover:bg-purple-50 cursor-pointer border-l-4 transition-colors ${isAssignedToCurrentUser
                                                                        ? 'border-l-purple-500 bg-purple-25'
                                                                        : 'border-l-transparent hover:border-l-purple-500'
                                                                        }`}
                                                                >
                                                                    <td className="px-3 py-2 pl-8 relative">
                                                                        {/* Connector Line Visualization */}
                                                                        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200"></div>
                                                                        <div className="absolute left-4 top-1/2 w-3 h-px bg-gray-200"></div>

                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedCases.has(caseData.caseId)}
                                                                            onChange={(e) => handleSelectCase(caseData.caseId, e.target.checked)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="relative z-10 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex flex-col">
                                                                            <div className="flex items-center gap-2">
                                                                                {caseData.benefitTypes && caseData.benefitTypes.length > 0 ? (
                                                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                                                                                        {caseData.benefitTypes[0]}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-gray-400 text-[10px]">No Type</span>
                                                                                )}
                                                                                <span className="text-[10px] text-gray-400">#{caseData.caseNumber}</span>
                                                                            </div>
                                                                            <span className="text-[10px] text-gray-500 mt-0.5">
                                                                                {caseData.clientName || '—'}
                                                                            </span>
                                                                            {isAssignedToCurrentUser && (
                                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 ml-1">
                                                                                    Assigned to You
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${caseData.leadId ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                            {caseData.leadId ? 'Sales' : 'Direct'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <RoleBadge role={caseData.assignedRole} />
                                                                    </td>
                                                                    <td className="px-3 py-2 text-xs text-gray-600">
                                                                        {assignedUser?.name || '—'}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <CaseStatusBadge status={caseData.processStatus} size="sm" />
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <PriorityBadge priority={caseData.priority} />
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <span className={`font-medium text-xs ${getAgeColor(age)}`}>
                                                                            {getAgeBadge(age)}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-xs text-gray-600">
                                                                        {formatDate(caseData.updatedAt)}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    router.push(`/case-details?id=${caseData.caseId}`);
                                                                                }}
                                                                                className="px-1.5 py-0.5 text-[10px] font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
                                                                            >
                                                                                View
                                                                            </button>
                                                                            {canReassign && !isReadOnly && (
                                                                                <button
                                                                                    onClick={(e) => handleReassignClick(caseData, e)}
                                                                                    className="px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                                                                >
                                                                                    Reassign
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                        {groupedCases.length === 0 && (
                                            <tbody>
                                                <tr>
                                                    <td colSpan={10} className="px-3 py-8 text-center text-gray-500 text-sm">
                                                        No cases found matching your criteria
                                                    </td>
                                                </tr>
                                            </tbody>
                                        )}
                                    </table>
                                </div>

                                {/* Table Footer */}
                                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
                                    Showing {groupedCases.length} companies ({filteredCases.length} cases)
                                    {isProcessExecutive && (
                                        <span className="ml-2 text-purple-600 font-medium">
                                            • Filtered to your assignments only
                                        </span>
                                    )}
                                    {selectedCases.size > 0 && (
                                        <span className="ml-2 text-purple-600 font-medium">
                                            • {selectedCases.size} selected
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
                    title={isReassigningBulk ? "Bulk Reassign Cases" : "Reassign Case"}
                    subtitle={
                        isReassigningBulk
                            ? `Reassigning ${selectedCases.size} selected case(s)`
                            : `Reassigning case: ${caseToReassign?.caseNumber || ''}`
                    }
                    getUsersByRole={(role) => getUsersByRole(role).map(u => ({ userId: u.userId, name: u.name }))}
                    defaultRole={caseToReassign?.assignedRole || 'PROCESS_EXECUTIVE'}
                    defaultUserId={caseToReassign?.assignedProcessUserId || ''}
                />

                {/* Delete Confirmation Modal */}
                <DeleteConfirmModal
                    isOpen={deleteModalOpen}
                    onClose={() => {
                        setDeleteModalOpen(false);
                        setCaseToDelete(null);
                    }}
                    onConfirm={handleDeleteConfirm}
                    title={caseToDelete ? "Delete Process Case" : `Delete ${selectedCases.size} Case(s)`}
                    message={caseToDelete
                        ? "This will permanently delete the case. This action cannot be undone."
                        : `This will permanently delete ${selectedCases.size} selected case(s). This action cannot be undone.`
                    }
                    itemName={caseToDelete?.caseNumber || `${selectedCases.size} selected cases`}
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
