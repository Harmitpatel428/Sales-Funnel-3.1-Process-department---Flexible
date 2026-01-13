"use client";

import React, { useState, useMemo } from 'react';
import { useLeads } from '@/app/context/LeadContext';
import { useUsers } from '@/app/context/UserContext';
import { FunnelChart } from '@/app/components/FunnelChart';
import {
    PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Target, DollarSign,
    Clock, Filter, Download, RefreshCw, Calendar, ChevronDown
} from 'lucide-react';
import {
    exportLeadsToExcel,
    exportLeadsToCSV,
    exportDataToPDF,
    type ExportColumn
} from '@/app/constants/exportUtils';

// Date range presets
const DATE_PRESETS = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'This Quarter', value: 'quarter' },
    { label: 'This Year', value: 'year' },
    { label: 'Custom', value: 'custom' }
];

// Lead statuses for funnel
const LEAD_FUNNEL_STAGES = ['NEW', 'FOLLOW_UP', 'HOTLEAD', 'MANDATE_SENT', 'DOCUMENTATION', 'DEAL_CLOSE'];

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface KPICardProps {
    title: string;
    value: string | number;
    change?: number;
    icon: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
}

const KPICard: React.FC<KPICardProps> = ({ title, value, change, icon, trend }) => (
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
            <div className="p-3 bg-indigo-50 rounded-lg">
                {icon}
            </div>
        </div>
    </div>
);

export default function ExecutiveLeadDashboard() {
    const { leads, isLoading } = useLeads();
    const { users } = useUsers();
    const [datePreset, setDatePreset] = useState('month');
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [assigneeFilter, setAssigneeFilter] = useState<string>('');
    const [sourceFilter, setSourceFilter] = useState<string>('');
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Export handlers
    const handleExportExcel = () => {
        exportLeadsToExcel(filteredLeads, {
            title: 'Executive Lead Report',
            fileName: `lead_report_${new Date().toISOString().split('T')[0]}.xlsx`
        });
        setShowExportMenu(false);
    };

    const handleExportCSV = () => {
        exportLeadsToCSV(filteredLeads, {
            fileName: `lead_report_${new Date().toISOString().split('T')[0]}.csv`
        });
        setShowExportMenu(false);
    };

    const handleExportPDF = () => {
        const columns: ExportColumn[] = [
            { key: 'clientName', header: 'Client Name' },
            { key: 'company', header: 'Company' },
            { key: 'mobileNumber', header: 'Mobile' },
            { key: 'source', header: 'Source' },
            { key: 'status', header: 'Status' },
            { key: 'budget', header: 'Budget', format: 'currency' },
            { key: 'createdAt', header: 'Created', format: 'date' }
        ];
        exportDataToPDF(filteredLeads, columns, {
            title: 'Executive Lead Report',
            includeSummary: true,
            summaryData: {
                'Total Leads': filteredLeads.length,
                'Conversion Rate': `${kpis.conversionRate}%`,
                'Pipeline Value': `₹${(kpis.pipelineValue / 100000).toFixed(1)}L`
            }
        });
        setShowExportMenu(false);
    };

    // Filter leads based on date range
    const filteredLeads = useMemo(() => {
        let filtered = leads.filter(l => !l.isDeleted);

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
            filtered = filtered.filter(l => new Date(l.createdAt || '') >= startDate!);
        }

        if (datePreset === 'custom' && customDateRange.end) {
            const endDate = new Date(customDateRange.end);
            filtered = filtered.filter(l => new Date(l.createdAt || '') <= endDate);
        }

        // Status filter
        if (statusFilter.length > 0) {
            filtered = filtered.filter(l => statusFilter.includes(l.status));
        }

        // Assignee filter
        if (assigneeFilter) {
            filtered = filtered.filter(l => l.assignedToId === assigneeFilter);
        }

        // Source filter
        if (sourceFilter) {
            filtered = filtered.filter(l => l.source === sourceFilter);
        }

        return filtered;
    }, [leads, datePreset, customDateRange, statusFilter, assigneeFilter, sourceFilter]);

    // Calculate KPIs
    const kpis = useMemo(() => {
        const totalLeads = filteredLeads.length;
        const closedDeals = filteredLeads.filter(l => l.status === 'DEAL_CLOSE').length;
        const conversionRate = totalLeads > 0 ? ((closedDeals / totalLeads) * 100).toFixed(1) : '0';

        // Pipeline value (sum of budget fields)
        const pipelineValue = filteredLeads.reduce((sum, l) => {
            const budget = parseFloat(l.budget?.replace(/[^0-9.]/g, '') || '0');
            return sum + budget;
        }, 0);

        // Win rate
        const mandateSent = filteredLeads.filter(l =>
            ['MANDATE_SENT', 'DOCUMENTATION', 'DEAL_CLOSE'].includes(l.status)
        ).length;
        const winRate = mandateSent > 0 ? ((closedDeals / mandateSent) * 100).toFixed(1) : '0';

        // Average deal size
        const avgDealSize = closedDeals > 0 ? pipelineValue / closedDeals : 0;

        // Lead velocity (new leads per day in period)
        const daysInPeriod = datePreset === 'today' ? 1 :
            datePreset === 'week' ? 7 :
                datePreset === 'month' ? 30 :
                    datePreset === 'quarter' ? 90 : 365;
        const leadVelocity = (totalLeads / daysInPeriod).toFixed(1);

        return {
            totalLeads,
            conversionRate,
            pipelineValue,
            winRate,
            avgDealSize,
            leadVelocity
        };
    }, [filteredLeads, datePreset]);

    // Status distribution for pie chart
    const statusDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredLeads.forEach(l => {
            counts[l.status] = (counts[l.status] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [filteredLeads]);

    // Source analysis for bar chart
    const sourceAnalysis = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredLeads.forEach(l => {
            const source = l.source || 'Unknown';
            counts[source] = (counts[source] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredLeads]);

    // Funnel data
    const funnelData = useMemo(() => {
        return LEAD_FUNNEL_STAGES.map(stage => ({
            name: stage.replace(/_/g, ' '),
            value: filteredLeads.filter(l => l.status === stage).length
        }));
    }, [filteredLeads]);

    // Sales rep leaderboard
    const leaderboard = useMemo(() => {
        const repStats: Record<string, { name: string; leads: number; closed: number; pipeline: number }> = {};

        filteredLeads.forEach(l => {
            if (!l.assignedToId) return;

            if (!repStats[l.assignedToId]) {
                const user = users.find(u => u.id === l.assignedToId);
                repStats[l.assignedToId] = {
                    name: user?.name || 'Unknown',
                    leads: 0,
                    closed: 0,
                    pipeline: 0
                };
            }

            repStats[l.assignedToId].leads++;
            if (l.status === 'DEAL_CLOSE') {
                repStats[l.assignedToId].closed++;
            }
            repStats[l.assignedToId].pipeline += parseFloat(l.budget?.replace(/[^0-9.]/g, '') || '0');
        });

        return Object.values(repStats)
            .sort((a, b) => b.closed - a.closed)
            .slice(0, 10);
    }, [filteredLeads, users]);

    // Time series trend data
    const trendData = useMemo(() => {
        const dailyCounts: Record<string, { date: string; created: number; closed: number }> = {};

        filteredLeads.forEach(l => {
            const date = new Date(l.createdAt || '').toISOString().split('T')[0];
            if (!dailyCounts[date]) {
                dailyCounts[date] = { date, created: 0, closed: 0 };
            }
            dailyCounts[date].created++;
            if (l.status === 'DEAL_CLOSE') {
                dailyCounts[date].closed++;
            }
        });

        return Object.values(dailyCounts).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredLeads]);

    // Get unique sources for filter
    const uniqueSources = useMemo(() => {
        const sources = new Set(leads.map(l => l.source).filter(Boolean));
        return Array.from(sources);
    }, [leads]);

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
                <h1 className="text-3xl font-bold text-slate-900">Executive Lead Dashboard</h1>
                <p className="text-slate-500 mt-1">Comprehensive lead analytics and performance metrics</p>
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

                    <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">All Sources</option>
                        {uniqueSources.map(source => (
                            <option key={source} value={source}>{source}</option>
                        ))}
                    </select>

                    <div className="relative ml-auto">
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Export
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                                <button
                                    onClick={handleExportExcel}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg"
                                >
                                    Export to Excel (.xlsx)
                                </button>
                                <button
                                    onClick={handleExportCSV}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    Export to CSV
                                </button>
                                <button
                                    onClick={handleExportPDF}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg"
                                >
                                    Export to PDF
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                <KPICard
                    title="Total Leads"
                    value={kpis.totalLeads}
                    icon={<Users className="w-6 h-6 text-indigo-600" />}
                    change={12}
                    trend="up"
                />
                <KPICard
                    title="Conversion Rate"
                    value={`${kpis.conversionRate}%`}
                    icon={<Target className="w-6 h-6 text-indigo-600" />}
                    change={5}
                    trend="up"
                />
                <KPICard
                    title="Pipeline Value"
                    value={`₹${(kpis.pipelineValue / 100000).toFixed(1)}L`}
                    icon={<DollarSign className="w-6 h-6 text-indigo-600" />}
                    change={-3}
                    trend="down"
                />
                <KPICard
                    title="Win Rate"
                    value={`${kpis.winRate}%`}
                    icon={<TrendingUp className="w-6 h-6 text-indigo-600" />}
                    change={8}
                    trend="up"
                />
                <KPICard
                    title="Avg Deal Size"
                    value={`₹${(kpis.avgDealSize / 100000).toFixed(1)}L`}
                    icon={<DollarSign className="w-6 h-6 text-indigo-600" />}
                />
                <KPICard
                    title="Lead Velocity"
                    value={`${kpis.leadVelocity}/day`}
                    icon={<Clock className="w-6 h-6 text-indigo-600" />}
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Status Distribution */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Status Distribution</h3>
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
                                {statusDistribution.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Lead Source Analysis */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Lead Source Analysis</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={sourceAnalysis} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Conversion Funnel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Conversion Funnel</h3>
                <FunnelChart data={funnelData} height={350} />
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Trend Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Lead Creation & Conversion Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="created" stroke="#4f46e5" strokeWidth={2} name="Created" />
                            <Line type="monotone" dataKey="closed" stroke="#10b981" strokeWidth={2} name="Closed" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Leaderboard */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Sales Rep Leaderboard</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Rank</th>
                                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Name</th>
                                    <th className="text-right py-3 px-2 text-sm font-medium text-slate-500">Leads</th>
                                    <th className="text-right py-3 px-2 text-sm font-medium text-slate-500">Closed</th>
                                    <th className="text-right py-3 px-2 text-sm font-medium text-slate-500">Pipeline</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((rep, index) => (
                                    <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-2">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                                index === 1 ? 'bg-slate-100 text-slate-800' :
                                                    index === 2 ? 'bg-orange-100 text-orange-800' :
                                                        'bg-slate-50 text-slate-600'
                                                }`}>
                                                {index + 1}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2 font-medium text-slate-900">{rep.name}</td>
                                        <td className="py-3 px-2 text-right text-slate-600">{rep.leads}</td>
                                        <td className="py-3 px-2 text-right text-emerald-600 font-medium">{rep.closed}</td>
                                        <td className="py-3 px-2 text-right text-slate-600">₹{(rep.pipeline / 100000).toFixed(1)}L</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
