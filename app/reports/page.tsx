'use client';

import React, { useState, useMemo } from 'react';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import { ProcessStatus, CasePriority } from '../types/processTypes';
import * as XLSX from 'xlsx';

// Utility functions
function calculateDaysBetween(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateString: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Quick date range presets
type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'last7' | 'last30' | 'last90' | 'all';

export default function ReportsPage() {
    const { cases } = useCases();
    const { users, getUserById } = useUsers();

    // Date range state
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [activePreset, setActivePreset] = useState<DatePreset>('all');

    // Filter state
    const [statusFilter, setStatusFilter] = useState<ProcessStatus | 'ALL'>('ALL');
    const [priorityFilter, setPriorityFilter] = useState<CasePriority | 'ALL'>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');

    // Apply date preset
    const applyPreset = (preset: DatePreset) => {
        setActivePreset(preset);
        const now = new Date();
        const formatDateInput = (date: Date) => {
            return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        };

        const end = formatDateInput(now);

        if (preset === 'all') {
            setStartDate('');
            setEndDate('');
        } else if (preset === 'today') {
            setStartDate(end);
            setEndDate(end);
        } else if (preset === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            setStartDate(formatDateInput(yesterday));
            setEndDate(formatDateInput(yesterday));
        } else if (preset === 'thisWeek') {
            const monday = new Date(now);
            const day = now.getDay() || 7; // Get current day number, converting Sunday (0) to 7
            if (day !== 1) monday.setHours(-24 * (day - 1)); // Set to Monday
            setStartDate(formatDateInput(monday));
            setEndDate(end);
        } else if (preset === 'thisMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(formatDateInput(firstDay));
            setEndDate(end);
        } else if (preset === 'thisYear') {
            const firstDay = new Date(now.getFullYear(), 0, 1);
            setStartDate(formatDateInput(firstDay));
            setEndDate(end);
        } else if (preset === 'last7') {
            const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            setStartDate(formatDateInput(start));
            setEndDate(end);
        } else if (preset === 'last30') {
            const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            setStartDate(formatDateInput(start));
            setEndDate(end);
        } else if (preset === 'last90') {
            const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            setStartDate(formatDateInput(start));
            setEndDate(end);
        }
    };

    // Filter cases by date range and other filters
    const filteredCases = useMemo(() => {
        let result = cases;

        // Date filter
        if (startDate) {
            result = result.filter(c => new Date(c.createdAt) >= new Date(startDate));
        }
        if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            result = result.filter(c => new Date(c.createdAt) <= endDateTime);
        }

        // Status filter
        if (statusFilter !== 'ALL') {
            result = result.filter(c => c.processStatus === statusFilter);
        }

        // Priority filter
        if (priorityFilter !== 'ALL') {
            result = result.filter(c => c.priority === priorityFilter);
        }

        // Assignee filter
        if (assigneeFilter !== 'ALL') {
            result = result.filter(c => c.assignedProcessUserId === assigneeFilter);
        }

        return result;
    }, [cases, startDate, endDate, statusFilter, priorityFilter, assigneeFilter]);

    // Calculate Metrics
    const totalCases = filteredCases.length;

    const statusCounts = filteredCases.reduce((acc, c) => {
        acc[c.processStatus] = (acc[c.processStatus] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const priorityCounts = filteredCases.reduce((acc, c) => {
        acc[c.priority] = (acc[c.priority] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const schemeCounts = filteredCases.reduce((acc, c) => {
        const scheme = c.schemeType || 'Unknown';
        acc[scheme] = (acc[scheme] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const benefitCounts = filteredCases.reduce((acc, c) => {
        const benefits = (c.benefitTypes && c.benefitTypes.length > 0) ? c.benefitTypes : ['Unknown'];
        benefits.forEach(b => {
            acc[b] = (acc[b] || 0) + 1;
        });
        return acc;
    }, {} as Record<string, number>);

    // User workload with detailed metrics
    const userWorkload = useMemo(() => {
        const workload: Record<string, {
            total: number;
            byStatus: Record<string, number>;
            closed: number;
            avgResolutionDays: number;
        }> = {};

        filteredCases.forEach(c => {
            const userId = c.assignedProcessUserId || 'Unassigned';
            if (!workload[userId]) {
                workload[userId] = { total: 0, byStatus: {}, closed: 0, avgResolutionDays: 0 };
            }
            workload[userId].total++;
            workload[userId].byStatus[c.processStatus] = (workload[userId].byStatus[c.processStatus] || 0) + 1;

            if (c.processStatus === 'CLOSED' || c.processStatus === 'APPROVED' || c.processStatus === 'REJECTED') {
                workload[userId].closed++;
            }
        });

        // Calculate completion rate
        Object.keys(workload).forEach(userId => {
            const w = workload[userId];
            if (w.total > 0) {
                w.avgResolutionDays = Math.round((w.closed / w.total) * 100);
            }
        });

        return workload;
    }, [filteredCases]);

    // Efficiency metrics
    const efficiencyMetrics = useMemo(() => {
        const pendingDocs = filteredCases.filter(c => c.processStatus === 'DOCUMENTS_PENDING').length;
        const inVerification = filteredCases.filter(c => c.processStatus === 'VERIFICATION').length;
        const queryRaised = filteredCases.filter(c => c.processStatus === 'QUERY_RAISED').length;
        const approved = filteredCases.filter(c => c.processStatus === 'APPROVED').length;
        const rejected = filteredCases.filter(c => c.processStatus === 'REJECTED').length;
        const submitted = filteredCases.filter(c => c.processStatus === 'SUBMITTED').length;

        const approvalRate = submitted + approved + rejected > 0
            ? Math.round((approved / (submitted + approved + rejected)) * 100)
            : 0;

        // Calculate average resolution time for closed cases
        const closedCases = filteredCases.filter(c => c.closedAt);
        let avgResolutionTime = 0;
        if (closedCases.length > 0) {
            const totalDays = closedCases.reduce((sum, c) => {
                return sum + calculateDaysBetween(c.createdAt, c.closedAt!);
            }, 0);
            avgResolutionTime = Math.round(totalDays / closedCases.length);
        }

        return {
            pendingDocs,
            pendingDocsPercent: totalCases > 0 ? Math.round((pendingDocs / totalCases) * 100) : 0,
            inVerification,
            queryRaised,
            approved,
            rejected,
            approvalRate,
            avgResolutionTime
        };
    }, [filteredCases, totalCases]);

    // Weekly trend
    const weeklyTrend = useMemo(() => {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const thisWeek = cases.filter(c => new Date(c.createdAt) >= oneWeekAgo).length;
        const lastWeek = cases.filter(c => new Date(c.createdAt) >= twoWeeksAgo && new Date(c.createdAt) < oneWeekAgo).length;

        const change = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;

        return { thisWeek, lastWeek, change };
    }, [cases]);

    // Get unique assignees for filter
    const assignees = useMemo(() => {
        const assigneeSet = new Set<string>();
        cases.forEach(c => {
            if (c.assignedProcessUserId) {
                assigneeSet.add(c.assignedProcessUserId);
            }
        });
        return Array.from(assigneeSet);
    }, [cases]);

    // Export functionality
    const handleExport = () => {
        try {
            const wb = XLSX.utils.book_new();

            // Summary sheet
            const summaryData = [
                ['Report Generated', new Date().toISOString()],
                ['Date Range', startDate && endDate ? `${startDate} to ${endDate}` : 'All Time'],
                [''],
                ['Summary Metrics'],
                ['Total Cases', totalCases],
                ['Approved', statusCounts['APPROVED'] || 0],
                ['Pending Documents', efficiencyMetrics.pendingDocs],
                ['In Verification', efficiencyMetrics.inVerification],
                ['Approval Rate', `${efficiencyMetrics.approvalRate}%`],
                ['Avg Resolution Time', `${efficiencyMetrics.avgResolutionTime} days`]
            ];
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

            // Status breakdown sheet
            const statusData = Object.entries(statusCounts).map(([status, count]) => ({
                Status: status.replace(/_/g, ' '),
                Count: count,
                Percentage: `${Math.round((count / totalCases) * 100)}%`
            }));
            const statusSheet = XLSX.utils.json_to_sheet(statusData);
            XLSX.utils.book_append_sheet(wb, statusSheet, 'Status Breakdown');

            // User workload sheet
            const workloadData = Object.entries(userWorkload).map(([userId, data]) => {
                const user = getUserById(userId);
                return {
                    User: user?.name || (userId === 'Unassigned' ? 'Unassigned' : 'Unknown'),
                    'Total Cases': data.total,
                    'Completed': data.closed,
                    'Completion Rate': `${data.avgResolutionDays}%`
                };
            });
            const workloadSheet = XLSX.utils.json_to_sheet(workloadData);
            XLSX.utils.book_append_sheet(wb, workloadSheet, 'User Workload');

            // Cases detail sheet
            const casesData = filteredCases.map(c => {
                const assignee = c.assignedProcessUserId ? getUserById(c.assignedProcessUserId) : null;
                return {
                    'Case Number': c.caseNumber,
                    'Company': c.company,
                    'Client': c.clientName,
                    'Status': c.processStatus,
                    'Priority': c.priority,
                    'Assigned To': assignee?.name || 'Unassigned',
                    'Created': formatDate(c.createdAt),
                    'Updated': formatDate(c.updatedAt)
                };
            });
            const casesSheet = XLSX.utils.json_to_sheet(casesData);
            XLSX.utils.book_append_sheet(wb, casesSheet, 'Cases Detail');

            // Scheme breakdown
            const schemeData = Object.entries(schemeCounts).map(([scheme, count]) => ({
                Scheme: scheme,
                Count: count,
                Percentage: `${totalCases > 0 ? Math.round((count / totalCases) * 100) : 0}%`
            }));
            const schemeSheet = XLSX.utils.json_to_sheet(schemeData);
            XLSX.utils.book_append_sheet(wb, schemeSheet, 'Scheme Breakdown');

            // Benefit breakdown
            const benefitData = Object.entries(benefitCounts).map(([benefit, count]) => ({
                Benefit: benefit,
                Count: count
            }));
            const benefitSheet = XLSX.utils.json_to_sheet(benefitData);
            XLSX.utils.book_append_sheet(wb, benefitSheet, 'Benefit Breakdown');

            // Download
            XLSX.writeFile(wb, `process-report-${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Export error:', error);
        }
    };

    return (
        <RoleGuard allowedRoles={['ADMIN', 'PROCESS_MANAGER']} fallback={<AccessDenied />}>
            <div className="min-h-screen bg-gray-50">
                <div className="p-6 max-w-7xl mx-auto">
                    {/* Header with Export */}
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Process Reports & Analytics</h1>
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export Report
                        </button>
                    </div>

                    {/* Date Range Selector */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Quick:</span>
                                <div className="flex gap-1">
                                    {[
                                        { key: 'today', label: 'Today' },
                                        { key: 'yesterday', label: 'Yesterday' },
                                        { key: 'thisWeek', label: 'This Week' },
                                        { key: 'thisMonth', label: 'This Month' },
                                        { key: 'thisYear', label: 'This Year' },
                                        { key: 'last7', label: 'Last 7 days' },
                                        { key: 'last30', label: 'Last 30 days' },
                                        { key: 'last90', label: 'Last 90 days' },
                                        { key: 'all', label: 'All time' }
                                    ].map(({ key, label }) => (
                                        <button
                                            key={key}
                                            onClick={() => applyPreset(key as DatePreset)}
                                            className={`px-3 py-1 text-xs rounded-full transition-colors ${activePreset === key
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Custom:</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => { setStartDate(e.target.value); setActivePreset('all'); }}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                                />
                                <span className="text-gray-500">to</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => { setEndDate(e.target.value); setActivePreset('all'); }}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
                        <div className="flex flex-wrap items-center gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                                >
                                    <option value="ALL">All Statuses</option>
                                    <option value="DOCUMENTS_PENDING">Documents Pending</option>
                                    <option value="DOCUMENTS_RECEIVED">Documents Received</option>
                                    <option value="VERIFICATION">Verification</option>
                                    <option value="SUBMITTED">Submitted</option>
                                    <option value="QUERY_RAISED">Query Raised</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="CLOSED">Closed</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                                <select
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value as any)}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                                >
                                    <option value="ALL">All Priorities</option>
                                    <option value="URGENT">Urgent</option>
                                    <option value="HIGH">High</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="LOW">Low</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Assignee</label>
                                <select
                                    value={assigneeFilter}
                                    onChange={(e) => setAssigneeFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                                >
                                    <option value="ALL">All Assignees</option>
                                    {assignees.map(userId => {
                                        const user = getUserById(userId);
                                        return (
                                            <option key={userId} value={userId}>
                                                {user?.name || 'Unknown'}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100">
                            <h3 className="text-sm font-bold text-gray-600">Total Cases</h3>
                            <p className="text-3xl font-bold text-purple-600">{totalCases}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-green-100">
                            <h3 className="text-sm font-bold text-gray-600">Approved</h3>
                            <p className="text-3xl font-bold text-green-600">{statusCounts['APPROVED'] || 0}</p>
                            <p className="text-xs text-gray-500">{efficiencyMetrics.approvalRate}% rate</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-yellow-100">
                            <h3 className="text-sm font-bold text-gray-600">In Verification</h3>
                            <p className="text-3xl font-bold text-yellow-600">{efficiencyMetrics.inVerification}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-red-100">
                            <h3 className="text-sm font-bold text-gray-600">Pending Docs</h3>
                            <p className="text-3xl font-bold text-red-600">{efficiencyMetrics.pendingDocs}</p>
                            <p className="text-xs text-gray-500">{efficiencyMetrics.pendingDocsPercent}% of total</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-100">
                            <h3 className="text-sm font-bold text-gray-600">Avg Resolution</h3>
                            <p className="text-3xl font-bold text-blue-600">{efficiencyMetrics.avgResolutionTime}</p>
                            <p className="text-xs text-gray-500">days</p>
                        </div>
                    </div>

                    {/* Week-over-Week Trend */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                        <h2 className="text-lg font-bold text-black mb-4">Weekly Trend</h2>
                        <div className="flex items-center gap-8">
                            <div>
                                <p className="text-sm text-gray-500">This Week</p>
                                <p className="text-2xl font-bold text-gray-900">{weeklyTrend.thisWeek} cases</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Last Week</p>
                                <p className="text-2xl font-bold text-gray-900">{weeklyTrend.lastWeek} cases</p>
                            </div>
                            <div className={`px-4 py-2 rounded-lg ${weeklyTrend.change >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                <p className="text-sm text-gray-500">Change</p>
                                <p className={`text-2xl font-bold ${weeklyTrend.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {weeklyTrend.change >= 0 ? '+' : ''}{weeklyTrend.change}%
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Status Breakdown */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-black mb-4">Case Status Breakdown</h2>
                            <div className="space-y-3">
                                {Object.entries(statusCounts).map(([status, count]) => (
                                    <div key={status} className="flex items-center justify-between">
                                        <span className="text-sm text-black font-medium bg-gray-100 px-2 py-1 rounded border border-gray-300">{status.replace(/_/g, ' ')}</span>
                                        <div className="flex items-center flex-1 mx-4">
                                            <div className="w-full bg-gray-100 rounded-full h-2">
                                                <div
                                                    className="bg-purple-500 h-2 rounded-full"
                                                    style={{ width: `${(count / totalCases) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* User Workload */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-black mb-4">Team Performance</h2>
                            <div className="space-y-3">
                                {Object.entries(userWorkload).map(([userId, data]) => {
                                    const user = users.find(u => u.userId === userId);
                                    const name = user ? user.name : (userId === 'Unassigned' ? 'Unassigned' : 'Unknown User');
                                    return (
                                        <div key={userId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                            <div>
                                                <span className="text-sm text-black font-medium">{name}</span>
                                                <div className="text-xs text-gray-500">
                                                    {data.closed} completed • {data.avgResolutionDays}% completion rate
                                                </div>
                                            </div>
                                            <span className="text-lg font-bold text-gray-900">{data.total}</span>
                                        </div>
                                    );
                                })}
                                {Object.keys(userWorkload).length === 0 && (
                                    <p className="text-sm text-black italic">No assigned cases yet.</p>
                                )}
                            </div>
                        </div>

                        {/* Priority Breakdown */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-black mb-4">Priority Breakdown</h2>
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(priorityCounts).map(([priority, count]) => (
                                    <div key={priority} className={`p-3 rounded-lg border ${priority === 'URGENT' ? 'bg-red-50 border-red-200' :
                                        priority === 'HIGH' ? 'bg-orange-50 border-orange-200' :
                                            priority === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' :
                                                'bg-blue-50 border-blue-200'
                                        }`}>
                                        <div className="text-xs font-bold text-black uppercase">{priority}</div>
                                        <div className="text-2xl font-bold text-black">{count}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Scheme Breakdown */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-black mb-4">Scheme Distribution</h2>
                            <div className="space-y-3">
                                {Object.entries(schemeCounts)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([scheme, count]) => (
                                        <div key={scheme} className="flex items-center justify-between">
                                            <span className="text-sm text-black font-medium truncate max-w-[60%] hover:max-w-none hover:bg-gray-50 p-1 rounded transition-all" title={scheme}>
                                                {scheme}
                                            </span>
                                            <div className="flex items-center flex-1 mx-4">
                                                <div className="w-full bg-gray-100 rounded-full h-2">
                                                    <div
                                                        className="bg-blue-500 h-2 rounded-full"
                                                        style={{ width: `${totalCases > 0 ? (count / totalCases) * 100 : 0}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                            <span className="text-sm font-bold text-gray-900">{count}</span>
                                        </div>
                                    ))}
                                {Object.keys(schemeCounts).length === 0 && <p className="text-sm text-gray-500 italic">No data available</p>}
                            </div>
                        </div>

                        {/* Benefit Breakdown */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-black mb-4">Benefit Type Distribution</h2>
                            <div className="space-y-3">
                                {Object.entries(benefitCounts)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([benefit, count]) => (
                                        <div key={benefit} className="flex items-center justify-between">
                                            <span className="text-sm text-black font-medium truncate max-w-[60%] hover:max-w-none hover:bg-gray-50 p-1 rounded transition-all" title={benefit}>
                                                {benefit}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <div className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-semibold">
                                                    {count}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                {Object.keys(benefitCounts).length === 0 && <p className="text-sm text-gray-500 italic">No data available</p>}
                            </div>
                        </div>

                        {/* Efficiency Metrics */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-black mb-4">Efficiency Metrics</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                                    <div className="text-xs font-bold text-orange-800">Query Raised</div>
                                    <div className="text-2xl font-bold text-orange-700">{efficiencyMetrics.queryRaised}</div>
                                </div>
                                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                                    <div className="text-xs font-bold text-green-800">Approval Rate</div>
                                    <div className="text-2xl font-bold text-green-700">{efficiencyMetrics.approvalRate}%</div>
                                </div>
                                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                                    <div className="text-xs font-bold text-red-800">Rejected Cases</div>
                                    <div className="text-2xl font-bold text-red-700">{efficiencyMetrics.rejected}</div>
                                </div>
                                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                                    <div className="text-xs font-bold text-blue-800">Avg Resolution</div>
                                    <div className="text-2xl font-bold text-blue-700">{efficiencyMetrics.avgResolutionTime} days</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </RoleGuard >
    );
}
