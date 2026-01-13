"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard, BarChart2, PieChart, TrendingUp,
    Users, Layers, FileText, Calendar, Settings
} from 'lucide-react';

const navigation = [
    { name: 'Executive Dashboard', href: '/reports/executive', icon: LayoutDashboard },
    { name: 'Cases Dashboard', href: '/reports/executive/cases', icon: BarChart2 },
    { name: 'Report Builder', href: '/reports/builder', icon: PieChart },
    { name: 'Forecasting', href: '/reports/forecasting', icon: TrendingUp },
    { name: 'Team Performance', href: '/reports/team', icon: Users },
    { name: 'Cohort Analysis', href: '/reports/cohorts', icon: Layers },
    { name: 'Templates', href: '/reports/templates', icon: FileText },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="flex min-h-screen">
            {/* Sidebar */}
            <div className="w-64 bg-slate-900 text-white flex flex-col">
                <div className="p-6 border-b border-slate-800">
                    <h2 className="text-xl font-bold">Reports & Analytics</h2>
                </div>
                <nav className="flex-1 p-4">
                    <ul className="space-y-1">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href ||
                                (item.href !== '/reports' && pathname.startsWith(item.href));
                            return (
                                <li key={item.name}>
                                    <Link
                                        href={item.href}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                            }`}
                                    >
                                        <item.icon className="w-5 h-5" />
                                        <span className="text-sm font-medium">{item.name}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <Link
                        href="/settings"
                        className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                        <span className="text-sm font-medium">Settings</span>
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                {children}
            </div>
        </div>
    );
}
