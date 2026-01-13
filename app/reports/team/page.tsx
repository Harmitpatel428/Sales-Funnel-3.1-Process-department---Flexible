"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useUsers } from '@/app/context/UserContext';
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    Users, Trophy, TrendingUp, Clock, Target,
    Calendar, Download, RefreshCw, ArrowUpDown
} from 'lucide-react';

interface TeamMemberStats {
    userId: string;
    name: string;
    role: string;
    leadsAssigned: number;
    leadsClosed: number;
    conversionRate: number;
    pipelineValue: number;
    avgDealSize: number;
    avgResolutionDays: number;
    casesProcessed: number;
    casesApproved: number;
}

interface PerformanceTrend {
    date: string;
    leads: number;
    conversions: number;
    cases: number;
}

export default function TeamPerformancePage() {
    const { users } = useUsers();
    const [teamStats, setTeamStats] = useState<TeamMemberStats[]>([]);
    const [trends, setTrends] = useState<Record<string, PerformanceTrend[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [dateRange, setDateRange] = useState('month');
    const [sortBy, setSortBy] = useState<keyof TeamMemberStats>('leadsClosed');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

    const fetchTeamPerformance = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/reports/team-performance?range=${dateRange}`);
            const result = await response.json();

            if (result.success) {
                setTeamStats(result.data.stats);
                setTrends(result.data.trends || {});
            }
        } catch (error) {
            console.error('Failed to fetch team performance:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTeamPerformance();
    }, [dateRange]);

    // Sort team stats
    const sortedStats = useMemo(() => {
        return [...teamStats].sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            const multiplier = sortDirection === 'desc' ? -1 : 1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * multiplier;
            }
            return String(aVal).localeCompare(String(bVal)) * multiplier;
        });
    }, [teamStats, sortBy, sortDirection]);

    // Top performers
    const topPerformers = useMemo(() => {
        return sortedStats.slice(0, 5);
    }, [sortedStats]);

    // Comparison data for selected users
    const comparisonData = useMemo(() => {
        if (selectedUsers.length < 2) return [];

        const selectedStats = teamStats.filter(s => selectedUsers.includes(s.userId));
        return [
            { metric: 'Leads Assigned', ...Object.fromEntries(selectedStats.map(s => [s.name, s.leadsAssigned])) },
            { metric: 'Leads Closed', ...Object.fromEntries(selectedStats.map(s => [s.name, s.leadsClosed])) },
            { metric: 'Conversion Rate (%)', ...Object.fromEntries(selectedStats.map(s => [s.name, s.conversionRate])) },
            { metric: 'Cases Processed', ...Object.fromEntries(selectedStats.map(s => [s.name, s.casesProcessed])) },
            { metric: 'Cases Approved', ...Object.fromEntries(selectedStats.map(s => [s.name, s.casesApproved])) }
        ];
    }, [selectedUsers, teamStats]);

    const toggleSort = (field: keyof TeamMemberStats) => {
        if (sortBy === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDirection('desc');
        }
    };

    const toggleUserSelection = (userId: string) => {
        setSelectedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

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
                <h1 className="text-3xl font-bold text-slate-900">Team Performance</h1>
                <p className="text-slate-500 mt-1">Track and compare team member performance metrics</p>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="quarter">This Quarter</option>
                            <option value="year">This Year</option>
                        </select>
                    </div>

                    <button
                        onClick={fetchTeamPerformance}
                        className="flex items-center gap-2 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>

                    <button
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* KPI Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 rounded-lg">
                            <Users className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Team Size</p>
                            <p className="text-2xl font-bold text-slate-900">{teamStats.length}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 rounded-lg">
                            <TrendingUp className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Total Leads Closed</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {teamStats.reduce((sum, s) => sum + s.leadsClosed, 0)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <Target className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Avg Conversion Rate</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {teamStats.length > 0
                                    ? (teamStats.reduce((sum, s) => sum + s.conversionRate, 0) / teamStats.length).toFixed(1)
                                    : 0}%
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-50 rounded-lg">
                            <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Avg Resolution Time</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {teamStats.length > 0
                                    ? (teamStats.reduce((sum, s) => sum + s.avgResolutionDays, 0) / teamStats.length).toFixed(1)
                                    : 0} days
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Leaderboard */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">Performance Leaderboard</h3>
                        <Trophy className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300"
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedUsers(teamStats.map(s => s.userId));
                                                } else {
                                                    setSelectedUsers([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">#</th>
                                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Name</th>
                                    <th
                                        className="text-right py-3 px-2 text-sm font-medium text-slate-500 cursor-pointer hover:text-indigo-600"
                                        onClick={() => toggleSort('leadsAssigned')}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Assigned
                                            <ArrowUpDown className="w-3 h-3" />
                                        </div>
                                    </th>
                                    <th
                                        className="text-right py-3 px-2 text-sm font-medium text-slate-500 cursor-pointer hover:text-indigo-600"
                                        onClick={() => toggleSort('leadsClosed')}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Closed
                                            <ArrowUpDown className="w-3 h-3" />
                                        </div>
                                    </th>
                                    <th
                                        className="text-right py-3 px-2 text-sm font-medium text-slate-500 cursor-pointer hover:text-indigo-600"
                                        onClick={() => toggleSort('conversionRate')}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Conv. Rate
                                            <ArrowUpDown className="w-3 h-3" />
                                        </div>
                                    </th>
                                    <th
                                        className="text-right py-3 px-2 text-sm font-medium text-slate-500 cursor-pointer hover:text-indigo-600"
                                        onClick={() => toggleSort('pipelineValue')}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Pipeline
                                            <ArrowUpDown className="w-3 h-3" />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedStats.map((member, index) => (
                                    <tr key={member.userId} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-2">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300"
                                                checked={selectedUsers.includes(member.userId)}
                                                onChange={() => toggleUserSelection(member.userId)}
                                            />
                                        </td>
                                        <td className="py-3 px-2">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                                    index === 1 ? 'bg-slate-100 text-slate-800' :
                                                        index === 2 ? 'bg-orange-100 text-orange-800' :
                                                            'bg-slate-50 text-slate-600'
                                                }`}>
                                                {index + 1}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2">
                                            <div>
                                                <p className="font-medium text-slate-900">{member.name}</p>
                                                <p className="text-xs text-slate-500">{member.role}</p>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2 text-right text-slate-600">{member.leadsAssigned}</td>
                                        <td className="py-3 px-2 text-right text-emerald-600 font-medium">{member.leadsClosed}</td>
                                        <td className="py-3 px-2 text-right">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${member.conversionRate >= 30 ? 'bg-emerald-100 text-emerald-800' :
                                                    member.conversionRate >= 15 ? 'bg-amber-100 text-amber-800' :
                                                        'bg-red-100 text-red-800'
                                                }`}>
                                                {member.conversionRate.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-2 text-right text-slate-600">
                                            ₹{(member.pipelineValue / 100000).toFixed(1)}L
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Top Performers */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Top 5 Performers</h3>
                    <div className="space-y-4">
                        {topPerformers.map((member, index) => (
                            <div key={member.userId} className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${index === 0 ? 'bg-yellow-500' :
                                        index === 1 ? 'bg-slate-400' :
                                            index === 2 ? 'bg-orange-400' :
                                                'bg-indigo-400'
                                    }`}>
                                    {index + 1}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-slate-900">{member.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {member.leadsClosed} closed • {member.conversionRate.toFixed(1)}% rate
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium text-slate-900">₹{(member.pipelineValue / 100000).toFixed(1)}L</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Comparison Chart */}
            {selectedUsers.length >= 2 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                        Performance Comparison ({selectedUsers.length} users selected)
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={comparisonData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="metric" type="category" width={150} />
                            <Tooltip />
                            <Legend />
                            {teamStats
                                .filter(s => selectedUsers.includes(s.userId))
                                .map((s, i) => (
                                    <Bar
                                        key={s.userId}
                                        dataKey={s.name}
                                        fill={['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'][i % 5]}
                                    />
                                ))
                            }
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Performance Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cases Metrics */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Case Processing</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={sortedStats.slice(0, 10)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="casesProcessed" fill="#4f46e5" name="Processed" />
                            <Bar dataKey="casesApproved" fill="#10b981" name="Approved" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Resolution Time */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Avg Resolution Time (Days)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={sortedStats.slice(0, 10)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="avgResolutionDays" fill="#f59e0b" name="Avg Days" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
