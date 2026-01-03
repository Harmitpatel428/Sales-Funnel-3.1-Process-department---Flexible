'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import CaseCard from '../components/CaseCard';
import CaseStatusBadge, { STATUS_ORDER, getStatusConfig } from '../components/CaseStatusBadge';
import { ProcessStatus, CasePriority, Case } from '../types/processTypes';

export default function CasesPage() {
    const router = useRouter();
    const { cases, getFilteredCases, isLoading } = useCases();
    const { currentUser } = useUsers();

    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [statusFilter, setStatusFilter] = useState<ProcessStatus | 'ALL'>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');

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

        // Status Filter (only for list view or single column selection)
        if (statusFilter !== 'ALL') {
            result = result.filter(c => c.processStatus === statusFilter);
        }

        // Assignee Filter
        if (assigneeFilter !== 'ALL') {
            result = result.filter(c => c.assignedProcessUserId === assigneeFilter);
        }

        // Role-based filtering (Process Executives only see their own cases usually, 
        // but here we let them see all since "Can manage assigned Cases" implies visibility. 
        // We can restrict strictly if needed, but usually a "My Cases" filter is enough).

        return result;
    }, [cases, searchTerm, statusFilter, assigneeFilter]);

    // Group by status for board view
    const casesByStatus = useMemo(() => {
        const grouped: Record<string, Case[]> = {};
        STATUS_ORDER.forEach(status => {
            grouped[status] = filteredCases.filter(c => c.processStatus === status);
        });
        return grouped;
    }, [filteredCases]);

    const handleCaseClick = (caseData: Case) => {
        router.push(`/case-details?id=${caseData.caseId}`);
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

                        <div className="flex items-center gap-3">
                            {/* View Toggle */}
                            <div className="bg-gray-100 p-1 rounded-lg flex border border-gray-200">
                                <button
                                    onClick={() => setViewMode('board')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'board' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                        </svg>
                                        Board
                                    </span>
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                        </svg>
                                        List
                                    </span>
                                </button>
                            </div>

                            {/* Add Case Button (Optional, usually mostly via Lead conversion) */}
                            {/* <button className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Case
              </button> */}
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
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        >
                            <option value="ALL">All Statuses</option>
                            {STATUS_ORDER.map(status => (
                                <option key={status} value={status}>{getStatusConfig(status).label}</option>
                            ))}
                        </select>

                        <select
                            value={assigneeFilter}
                            onChange={(e) => setAssigneeFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        >
                            <option value="ALL">All Assignees</option>
                            {/* Note: In a real app we'd map users here. For now simpler. */}
                            {currentUser && <option value={currentUser.userId}>My Cases</option>}
                        </select>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                    <div className="max-w-[1920px] mx-auto h-full">
                        {viewMode === 'board' ? (
                            // Kanban Board View
                            <div className="flex gap-4 h-full pb-2">
                                {STATUS_ORDER.map(status => {
                                    const config = getStatusConfig(status);
                                    const items = casesByStatus[status] || [];

                                    return (
                                        <div key={status} className="flex-none w-80 flex flex-col h-full bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                                            {/* Column Header */}
                                            <div className={`p-3 border-b border-gray-200 font-semibold flex justify-between items-center ${config.bgColor} bg-opacity-50`}>
                                                <div className="flex items-center gap-2">
                                                    <span>{config.icon}</span>
                                                    <span className={`${config.textColor}`}>{config.label}</span>
                                                </div>
                                                <span className="bg-white bg-opacity-60 px-2 py-0.5 rounded-full text-xs text-gray-600 font-bold border border-gray-200">
                                                    {items.length}
                                                </span>
                                            </div>

                                            {/* Column Content */}
                                            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                                                {items.length > 0 ? (
                                                    items.map(caseData => (
                                                        <CaseCard
                                                            key={caseData.caseId}
                                                            caseData={caseData}
                                                            onClick={handleCaseClick}
                                                        />
                                                    ))
                                                ) : (
                                                    <div className="text-center py-8 text-gray-400 text-sm italic">
                                                        No cases
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            // List View
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                                <div className="overflow-y-auto flex-1">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
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
                                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                        {caseData.caseNumber}
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
                                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                                        No cases found matching your filters.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}
