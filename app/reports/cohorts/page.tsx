"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useLeads } from '@/app/context/LeadContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Target, TrendingUp, Filter } from 'lucide-react';

export default function CohortsPage() {
    const { leads } = useLeads();
    const [cohortBy, setCohortBy] = useState<'month' | 'quarter'>('month');
    const [segmentBy, setSegmentBy] = useState<string>('source');

    const cohortData = useMemo(() => {
        const cohorts: Record<string, any[]> = {};
        leads.filter(l => !l.isDeleted).forEach(lead => {
            const createdAt = new Date(lead.createdAt || '');
            let cohortKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
            if (cohortBy === 'quarter') {
                const quarter = Math.floor(createdAt.getMonth() / 3) + 1;
                cohortKey = `${createdAt.getFullYear()}-Q${quarter}`;
            }
            if (!cohorts[cohortKey]) cohorts[cohortKey] = [];
            cohorts[cohortKey].push(lead);
        });

        return Object.keys(cohorts).sort().slice(-12).map(key => {
            const cohortLeads = cohorts[key];
            const total = cohortLeads.length;
            const closed = cohortLeads.filter(l => l.status === 'DEAL_CLOSE').length;
            return { cohort: key, total, closed, rate: total > 0 ? ((closed / total) * 100).toFixed(1) : 0 };
        });
    }, [leads, cohortBy]);

    const segmentData = useMemo(() => {
        const segments: Record<string, any[]> = {};
        leads.filter(l => !l.isDeleted).forEach(lead => {
            const key = (lead as any)[segmentBy] || 'Unknown';
            if (!segments[key]) segments[key] = [];
            segments[key].push(lead);
        });

        return Object.entries(segments).map(([name, segmentLeads]) => {
            const count = segmentLeads.length;
            const closed = segmentLeads.filter(l => l.status === 'DEAL_CLOSE').length;
            const rate = count > 0 ? (closed / count) * 100 : 0;
            const value = segmentLeads.reduce((sum, l) => sum + parseFloat(l.budget?.replace(/[^0-9.]/g, '') || '0'), 0);
            return { name, count, closed, rate: rate.toFixed(1), value: Math.round(value / 100000) };
        }).sort((a, b) => b.count - a.count).slice(0, 10);
    }, [leads, segmentBy]);

    const rfmSegments = useMemo(() => {
        const segments = { Champions: 0, Loyal: 0, Developing: 0, AtRisk: 0, Hibernating: 0 };
        const now = new Date();
        leads.filter(l => !l.isDeleted).forEach(lead => {
            const lastActivity = lead.lastActivityDate ? new Date(lead.lastActivityDate) : new Date(lead.createdAt || '');
            const daysSince = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
            const activities = JSON.parse(lead.activities || '[]');
            const budget = parseFloat(lead.budget?.replace(/[^0-9.]/g, '') || '0');

            const r = daysSince < 7 ? 5 : daysSince < 30 ? 4 : daysSince < 90 ? 3 : daysSince < 180 ? 2 : 1;
            const f = activities.length >= 10 ? 5 : activities.length >= 5 ? 4 : activities.length >= 2 ? 3 : activities.length >= 1 ? 2 : 1;
            const m = budget >= 1000000 ? 5 : budget >= 500000 ? 4 : budget >= 100000 ? 3 : budget >= 50000 ? 2 : 1;
            const avg = (r + f + m) / 3;

            if (avg >= 4) segments.Champions++;
            else if (avg >= 3.5) segments.Loyal++;
            else if (avg >= 2.5) segments.Developing++;
            else if (r <= 2 && avg >= 2) segments.AtRisk++;
            else segments.Hibernating++;
        });
        return Object.entries(segments).map(([name, value]) => ({ name, value }));
    }, [leads]);

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Cohort Analysis</h1>
                <p className="text-slate-500 mt-1">Analyze retention and segmentation patterns</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <select value={cohortBy} onChange={(e) => setCohortBy(e.target.value as any)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <option value="month">Monthly Cohorts</option>
                        <option value="quarter">Quarterly Cohorts</option>
                    </select>
                    <select value={segmentBy} onChange={(e) => setSegmentBy(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <option value="source">Segment by Source</option>
                        <option value="status">Segment by Status</option>
                        <option value="companyLocation">Segment by Location</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Cohort Conversion</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={cohortData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="cohort" angle={-45} textAnchor="end" height={80} />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Legend />
                            <Bar yAxisId="left" dataKey="total" fill="#4f46e5" name="Total Leads" />
                            <Bar yAxisId="left" dataKey="closed" fill="#10b981" name="Closed" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Segment Analysis</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={segmentData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#4f46e5" name="Count" />
                            <Bar dataKey="closed" fill="#10b981" name="Closed" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">RFM Segments</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={rfmSegments}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#8b5cf6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Segment Performance</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2 text-sm font-medium text-slate-500">Segment</th>
                                    <th className="text-right py-2 text-sm font-medium text-slate-500">Count</th>
                                    <th className="text-right py-2 text-sm font-medium text-slate-500">Conv. Rate</th>
                                    <th className="text-right py-2 text-sm font-medium text-slate-500">Pipeline (L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {segmentData.map((seg, i) => (
                                    <tr key={i} className="border-b border-slate-100">
                                        <td className="py-2 font-medium text-slate-900">{seg.name}</td>
                                        <td className="py-2 text-right text-slate-600">{seg.count}</td>
                                        <td className="py-2 text-right text-emerald-600">{seg.rate}%</td>
                                        <td className="py-2 text-right text-slate-600">₹{seg.value}L</td>
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
