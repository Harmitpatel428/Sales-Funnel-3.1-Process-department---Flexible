"use client";

import React from 'react';
import Link from 'next/link';
import {
    LayoutDashboard, BarChart2, PieChart, TrendingUp,
    Users, Layers, FileText, ArrowRight
} from 'lucide-react';

const reports = [
    {
        title: 'Executive Lead Dashboard',
        description: 'Comprehensive lead analytics with KPIs, funnel, and team leaderboard',
        href: '/reports/executive',
        icon: LayoutDashboard,
        color: 'bg-indigo-500'
    },
    {
        title: 'Case Processing Dashboard',
        description: 'Case status distribution, priority breakdown, and team performance',
        href: '/reports/executive/cases',
        icon: BarChart2,
        color: 'bg-blue-500'
    },
    {
        title: 'Custom Report Builder',
        description: 'Build custom reports with drag-and-drop field selection',
        href: '/reports/builder',
        icon: PieChart,
        color: 'bg-purple-500'
    },
    {
        title: 'Sales Forecasting',
        description: 'Time-series analysis and trend predictions with scenarios',
        href: '/reports/forecasting',
        icon: TrendingUp,
        color: 'bg-emerald-500'
    },
    {
        title: 'Team Performance',
        description: 'Track and compare team member performance metrics',
        href: '/reports/team',
        icon: Users,
        color: 'bg-amber-500'
    },
    {
        title: 'Cohort Analysis',
        description: 'Analyze retention patterns and RFM segmentation',
        href: '/reports/cohorts',
        icon: Layers,
        color: 'bg-pink-500'
    },
    {
        title: 'Report Templates',
        description: 'Save and reuse report configurations',
        href: '/reports/templates',
        icon: FileText,
        color: 'bg-slate-500'
    }
];

export default function ReportsIndexPage() {
    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Reports & Analytics</h1>
                <p className="text-slate-500 mt-1">Access all reporting and analytics features</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map((report) => (
                    <Link
                        key={report.href}
                        href={report.href}
                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-all group"
                    >
                        <div className={`inline-flex p-3 rounded-lg ${report.color} mb-4`}>
                            <report.icon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                            {report.title}
                            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <p className="text-slate-500 text-sm">{report.description}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
