'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import CaseStatusBadge, { STATUS_ORDER, getStatusConfig } from '../components/CaseStatusBadge';
import PasswordModal from '../components/PasswordModal';
import { ProcessStatus, Case } from '../types/processTypes';

export default function CasesPage() {
    const router = useRouter();
    const { cases, isLoading, deleteCase } = useCases();
    const { currentUser } = useUsers();

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<ProcessStatus | 'ALL'>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
    const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

    // Filter cases based on local state
    const filteredCases = useMemo(() => {
        let result = cases;

        // Search
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(c =>
                c.clientName?.toLowerCase().includes(lowerTerm) ||
                c.caseNumber?.toLowerCase().includes(lowerTerm) ||
                c.company?.toLowerCase().includes(lowerTerm) ||
                c.mobileNumber?.includes(lowerTerm)
            );
        }

        // Status Filter
        if (statusFilter !== 'ALL') {
            result = result.filter(c => c.processStatus === statusFilter);
        }

        // Assignee Filter
        if (assigneeFilter !== 'ALL') {
            result = result.filter(c => c.assignedProcessUserId === assigneeFilter);
        }

        return result;
    }, [cases, searchTerm, statusFilter, assigneeFilter]);

    // Handle selection
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedCaseIds(new Set(filteredCases.map(c => c.caseId)));
        } else {
            setSelectedCaseIds(new Set());
        }
    };

    const handleSelectRow = (caseId: string) => {
        const newSelected = new Set(selectedCaseIds);
        if (newSelected.has(caseId)) {
            newSelected.delete(caseId);
        } else {
            newSelected.add(caseId);
        }
        setSelectedCaseIds(newSelected);
    };

    const handleDeleteClick = () => {
        setIsPasswordModalOpen(true);
    };

    const handlePasswordSuccess = () => {
        selectedCaseIds.forEach(id => {
            deleteCase(id);
        });
        setSelectedCaseIds(new Set());
        setIsPasswordModalOpen(false);
    };

    const handleCaseClick = (caseData: Case) => {
        router.push(`/case-details?id=${caseData.caseId}`);
    };

    const getBadgeStatus = (createdAt?: string): 'JUST_ADDED' | 'NEW' | null => {
        if (!createdAt) return null;
        try {
            const created = new Date(createdAt);
            const now = new Date();
            const diffInMinutes = (now.getTime() - created.getTime()) / (1000 * 60);

            if (diffInMinutes < 20) return 'JUST_ADDED';
            if (diffInMinutes < 24 * 60) return 'NEW';
            return null;
        } catch (e) {
            return null;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    return (
        <RoleGuard
            allowedRoles={['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE']}
            fallback={<AccessDenied />}
        >
            <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-shrink-0">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Case Management</h1>
                            <p className="text-sm text-gray-500">Manage and track government subsidy applications</p>
                        </div>


                        {/* Actions */}
                        <div className="flex gap-2">
                            {selectedCaseIds.size > 0 && (
                                <button
                                    onClick={handleDeleteClick}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete Selected ({selectedCaseIds.size})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="max-w-7xl mx-auto mt-4 flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search cases, clients, phone..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-black placeholder-black"
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as ProcessStatus | 'ALL')}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-black"
                        >
                            <option value="ALL">All Statuses</option>
                            {STATUS_ORDER.map(status => (
                                <option key={status} value={status}>{getStatusConfig(status).label}</option>
                            ))}
                        </select>

                        <select
                            value={assigneeFilter}
                            onChange={(e) => setAssigneeFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-black"
                        >
                            <option value="ALL">All Assignees</option>
                            {currentUser && <option value={currentUser.userId}>My Cases</option>}
                        </select>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                    <div className="max-w-[1920px] mx-auto h-full">
                        {/* List View */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                            <div className="overflow-y-auto flex-1">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-4">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredCases.length > 0 && selectedCaseIds.size === filteredCases.length}
                                                    onChange={handleSelectAll}
                                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                />
                                            </th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Case Number</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Client</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Scheme</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredCases.map((caseData) => (
                                            <tr
                                                key={caseData.caseId}
                                                onClick={() => handleCaseClick(caseData)}
                                                className="hover:bg-purple-50 cursor-pointer transition-colors"
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCaseIds.has(caseData.caseId)}
                                                        onChange={() => handleSelectRow(caseData.caseId)}
                                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                    <div className="flex items-center gap-2">
                                                        {caseData.caseNumber}
                                                        {getBadgeStatus(caseData.createdAt) === 'JUST_ADDED' && (
                                                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-200 shadow-sm animate-pulse whitespace-nowrap">
                                                                JUST ADDED
                                                            </span>
                                                        )}
                                                        {getBadgeStatus(caseData.createdAt) === 'NEW' && (
                                                            <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-purple-200 shadow-sm animate-pulse">
                                                                NEW
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                                                    <div className="font-medium">{caseData.clientName}</div>
                                                    <div className="text-xs text-gray-500">{caseData.mobileNumber}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                    {caseData.schemeType}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <CaseStatusBadge status={caseData.processStatus} size="sm" />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`
                                                        px-2 py-0.5 rounded text-xs font-medium border
                                                        ${caseData.priority === 'URGENT' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            caseData.priority === 'HIGH' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                caseData.priority === 'MEDIUM' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                    'bg-gray-50 text-gray-700 border-gray-200'}
                                                    `}>
                                                        {caseData.priority}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                    {new Date(caseData.updatedAt).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredCases.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                                    No cases found matching your filters.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <PasswordModal
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
                operation="caseManagement"
                onSuccess={handlePasswordSuccess}
                title="Delete Cases"
                description={`Are you sure you want to delete ${selectedCaseIds.size} selected case(s)? This action cannot be undone.`}
            />
        </RoleGuard >
    );
}
