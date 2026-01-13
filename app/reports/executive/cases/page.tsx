"use client";

import React, { useState, useMemo } from 'react';
import { useCases } from '@/app/context/CaseContext';
import { useUsers } from '@/app/context/UserContext';
import {
    PieChart, Pie, Cell, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    TrendingUp, TrendingDown, Briefcase, CheckCircle,
    Clock, AlertTriangle, Download, Calendar
} from 'lucide-react';

const DATE_PRESETS = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'This Quarter', value: 'quarter' },
    { label: 'This Year', value: 'year' },
    { label: 'Custom', value: 'custom' }
];

const CASE_STATUSES = [
    'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'VERIFICATION',
    'SUBMITTED', 'QUERY_RAISED', 'APPROVED', 'REJECTED', 'CLOSED'
];

const COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#4f46e5', '#ec4899', '#10b981', '#ef4444', '#6b7280'];

interface KPICardProps {
    title: string;
    value: string | number;
    change?: number;
    icon: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    color?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, change, icon, trend, color = 'indigo' }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500">{title}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                {change !== undefined && (
                    <div className={`flex items-center mt-2 text-sm ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'
                        }`}>
                        {trend === 'up' ? <TrendingUp className="w-4 h-4 mr-1" /> :
                            trend === 'down' ? <TrendingDown className="w-4 h-4 mr-1" /> : null}
                        <span>{change > 0 ? '+' : ''}{change}% vs last period</span>
                    </div>
                )}
            </div>
            <div className={`p-3 bg-${color}-50 rounded-lg`}>
                {icon}
            </div>
        </div>
    </div>
);

export default function ExecutiveCaseDashboard() {
    const { cases, isLoading } = useCases();
    const { users } = useUsers();
    const [datePreset, setDatePreset] = useState('month');
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [assigneeFilter, setAssigneeFilter] = useState<string>('');

    // Filter cases based on date range
    const filteredCases = useMemo(() => {
        let filtered = [...cases];

        // Date filtering
        const now = new Date();
        let startDate: Date | null = null;

        switch (datePreset) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'quarter':
                const quarterStart = Math.floor(now.getMonth() / 3) * 3;
                startDate = new Date(now.getFullYear(), quarterStart, 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case 'custom':
                if (customDateRange.start) startDate = new Date(customDateRange.start);
                break;
        }

        if (startDate) {
            filtered = filtered.filter(c => new Date(c.createdAt) >= startDate!);
        }

        if (datePreset === 'custom' && customDateRange.end) {
            const endDate = new Date(customDateRange.end);
            filtered = filtered.filter(c => new Date(c.createdAt) <= endDate);
        }

        // Status filter
        if (statusFilter.length > 0) {
            filtered = filtered.filter(c => statusFilter.includes(c.processStatus));
        }

        // Assignee filter
        if (assigneeFilter) {
            filtered = filtered.filter(c => c.assignedProcessUserId === assigneeFilter);
        }

        return filtered;
    }, [cases, datePreset, customDateRange, statusFilter, assigneeFilter]);

    // Calculate KPIs
    const kpis = useMemo(() => {
        const totalCases = filteredCases.length;
        const approved = filteredCases.filter(c => c.processStatus === 'APPROVED').length;
        const rejected = filteredCases.filter(c => c.processStatus === 'REJECTED').length;
        const pending = filteredCases.filter(c => c.processStatus === 'DOCUMENTS_PENDING').length;
        const queryRaised = filteredCases.filter(c => c.processStatus === 'QUERY_RAISED').length;

        const approvalRate = totalCases > 0 ? ((approved / totalCases) * 100).toFixed(1) : '0';
        const pendingDocsPercent = totalCases > 0 ? ((pending / totalCases) * 100).toFixed(1) : '0';
        const queryRate = totalCases > 0 ? ((queryRaised / totalCases) * 100).toFixed(1) : '0';
        const rejectionRate = totalCases > 0 ? ((rejected / totalCases) * 100).toFixed(1) : '0';

        // Average resolution time (closed cases)
        const closedCases = filteredCases.filter(c => c.closedAt);
        let avgResolutionDays = 0;
        if (closedCases.length > 0) {
            const totalDays = closedCases.reduce((sum, c) => {
                const created = new Date(c.createdAt);
                const closed = new Date(c.closedAt!);
                return sum + ((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
            }, 0);
            avgResolutionDays = totalDays / closedCases.length;
        }

        return {
            totalCases,
            approved,
            approvalRate,
            pendingDocsPercent,
            queryRate,
            rejectionRate,
            avgResolutionDays: avgResolutionDays.toFixed(1)
        };
    }, [filteredCases]);

    // Status distribution for pie chart
    const statusDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredCases.forEach(c => {
            counts[c.processStatus] = (counts[c.processStatus] || 0) + 1;
        });
        return CASE_STATUSES.map((status, index) => ({
            name: status.replace(/_/g, ' '),
            value: counts[status] || 0,
            fill: COLORS[index]
        })).filter(d => d.value > 0);
    }, [filteredCases]);

    // Priority breakdown
    const priorityBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredCases.forEach(c => {
            counts[c.priority] = (counts[c.priority] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [filteredCases]);

    // Scheme type analysis
    const schemeTypeAnalysis = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredCases.forEach(c => {
            const scheme = c.schemeType || 'Unknown';
            counts[scheme] = (counts[scheme] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredCases]);

    // Team performance
    const teamPerformance = useMemo(() => {
        const userStats: Record<string, {
            name: string;
            total: number;
            approved: number;
            avgDays: number;
            daysSum: number;
            closedCount: number;
        }> = {};

        filteredCases.forEach(c => {
            if (!c.assignedProcessUserId) return;

            if (!userStats[c.assignedProcessUserId]) {
                const user = users.find(u => u.id === c.assignedProcessUserId);
                userStats[c.assignedProcessUserId] = {
                    name: user?.name || 'Unknown',
                    total: 0,
                    approved: 0,
                    avgDays: 0,
                    daysSum: 0,
                    closedCount: 0
                };
            }

            userStats[c.assignedProcessUserId].total++;
            if (c.processStatus === 'APPROVED') {
                userStats[c.assignedProcessUserId].approved++;
            }
            if (c.closedAt) {
                const days = (new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                userStats[c.assignedProcessUserId].daysSum += days;
                userStats[c.assignedProcessUserId].closedCount++;
            }
        });

        return Object.values(userStats)
            .map(u => ({
                ...u,
                avgDays: u.closedCount > 0 ? (u.daysSum / u.closedCount).toFixed(1) : '-',
                completionRate: u.total > 0 ? ((u.approved / u.total) * 100).toFixed(0) : '0'
            }))
            .sort((a, b) => b.approved - a.approved)
            .slice(0, 10);
    }, [filteredCases, users]);

    // Case aging analysis
    const caseAging = useMemo(() => {
        const now = new Date();
        const buckets = {
            '0-7 days': 0,
            '8-14 days': 0,
            '15-30 days': 0,
            '30+ days': 0
        };

        filteredCases.filter(c => !c.closedAt).forEach(c => {
            const age = (now.getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (age <= 7) buckets['0-7 days']++;
            else if (age <= 14) buckets['8-14 days']++;
            else if (age <= 30) buckets['15-30 days']++;
            else buckets['30+ days']++;
        });

        return Object.entries(buckets).map(([name, value]) => ({ name, value }));
    }, [filteredCases]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Executive Case Dashboard</h1>
                <p className="text-slate-500 mt-1">Case processing analytics and team performance metrics</p>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <select
                            value={datePreset}
                            onChange={(e) => setDatePreset(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            {DATE_PRESETS.map(preset => (
                                <option key={preset.value} value={preset.value}>{preset.label}</option>
                            ))}
                        </select>
                    </div>

                    {datePreset === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={customDateRange.start}
                                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            />
                            <span className="text-slate-400">to</span>
                            <input
                                type="date"
                                value={customDateRange.end}
                                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    )}

                    <select
                        value={assigneeFilter}
                        onChange={(e) => setAssigneeFilter(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">All Assignees</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                        ))}
                    </select>

                    <button className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                <KPICard
                    title="Total Cases"
                    value={kpis.totalCases}
                    icon={<Briefcase className="w-6 h-6 text-indigo-600" />}
                    change={8}
                    trend="up"
                />
                <KPICard
                    title="Approval Rate"
                    value={`${kpis.approvalRate}%`}
                    icon={<CheckCircle className="w-6 h-6 text-emerald-600" />}
                    change={3}
                    trend="up"
                />
                <KPICard
                    title="Avg Resolution"
                    value={`${kpis.avgResolutionDays} days`}
                    icon={<Clock className="w-6 h-6 text-blue-600" />}
                    change={-5}
                    trend="up"
                />
                <KPICard
                    title="Pending Docs"
                    value={`${kpis.pendingDocsPercent}%`}
                    icon={<AlertTriangle className="w-6 h-6 text-amber-600" />}
                />
                <KPICard
                    title="Query Rate"
                    value={`${kpis.queryRate}%`}
                    icon={<AlertTriangle className="w-6 h-6 text-orange-600" />}
                />
                <KPICard
                    title="Rejection Rate"
                    value={`${kpis.rejectionRate}%`}
                    icon={<TrendingDown className="w-6 h-6 text-red-600" />}
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Status Distribution */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Case Status Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={statusDistribution}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {statusDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Priority Breakdown */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Priority Breakdown</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={priorityBreakdown}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Scheme Type Analysis */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Scheme Type Analysis</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={schemeTypeAnalysis} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={120} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Case Aging */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Case Aging Analysis</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={caseAging}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Team Performance */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Team Performance</h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Team Member</th>
                                <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Total Cases</th>
                                <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Approved</th>
                                <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Completion Rate</th>
                                <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Avg Resolution</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teamPerformance.map((member, index) => (
                                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-3 px-4 font-medium text-slate-900">{member.name}</td>
                                    <td className="py-3 px-4 text-right text-slate-600">{member.total}</td>
                                    <td className="py-3 px-4 text-right text-emerald-600 font-medium">{member.approved}</td>
                                    <td className="py-3 px-4 text-right">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${parseInt(member.completionRate) >= 80 ? 'bg-emerald-100 text-emerald-800' :
                                                parseInt(member.completionRate) >= 60 ? 'bg-amber-100 text-amber-800' :
                                                    'bg-red-100 text-red-800'
                                            }`}>
                                            {member.completionRate}%
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-600">{member.avgDays} days</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
