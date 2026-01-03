'use client';

import React from 'react';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';

export default function ReportsPage() {
    const { cases } = useCases();
    const { users } = useUsers();

    // Calculate Metrics
    const totalCases = cases.length;
    const statusCounts = cases.reduce((acc, c) => {
        acc[c.processStatus] = (acc[c.processStatus] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const userWorkload = cases.reduce((acc, c) => {
        if (c.assignedProcessUserId) {
            acc[c.assignedProcessUserId] = (acc[c.assignedProcessUserId] || 0) + 1;
        } else {
            acc['Unassigned'] = (acc['Unassigned'] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const priorityCounts = cases.reduce((acc, c) => {
        acc[c.priority] = (acc[c.priority] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <RoleGuard allowedRoles={['ADMIN', 'PROCESS_MANAGER']} fallback={<AccessDenied />}>
            <div className="p-6 max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Process Reports & Analytics</h1>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100">
                        <h3 className="text-sm font-medium text-gray-500">Total Cases</h3>
                        <p className="text-3xl font-bold text-purple-600">{totalCases}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-green-100">
                        <h3 className="text-sm font-medium text-gray-500">Approved</h3>
                        <p className="text-3xl font-bold text-green-600">{statusCounts['APPROVED'] || 0}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-yellow-100">
                        <h3 className="text-sm font-medium text-gray-500">In Verification</h3>
                        <p className="text-3xl font-bold text-yellow-600">{statusCounts['VERIFICATION'] || 0}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-red-100">
                        <h3 className="text-sm font-medium text-gray-500">Pending Docs</h3>
                        <p className="text-3xl font-bold text-red-600">{statusCounts['DOCUMENTS_PENDING'] || 0}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Breakdown */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h2 className="text-lg font-semibold mb-4">Case Status Breakdown</h2>
                        <div className="space-y-3">
                            {Object.entries(statusCounts).map(([status, count]) => (
                                <div key={status} className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">{status.replace('_', ' ')}</span>
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
                        <h2 className="text-lg font-semibold mb-4">User Workload</h2>
                        <div className="space-y-3">
                            {Object.entries(userWorkload).map(([userId, count]) => {
                                const user = users.find(u => u.userId === userId);
                                const name = user ? user.name : (userId === 'Unassigned' ? 'Unassigned' : 'Unknown User');
                                return (
                                    <div key={userId} className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">{name}</span>
                                        <span className="text-sm font-bold text-gray-900">{count} cases</span>
                                    </div>
                                );
                            })}
                            {Object.keys(userWorkload).length === 0 && (
                                <p className="text-sm text-gray-500 italic">No assigned cases yet.</p>
                            )}
                        </div>
                    </div>

                    {/* Priority Breakdown */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h2 className="text-lg font-semibold mb-4">Priority Breakdown</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {Object.entries(priorityCounts).map(([priority, count]) => (
                                <div key={priority} className={`p-3 rounded-lg border ${priority === 'URGENT' ? 'bg-red-50 border-red-200' :
                                        priority === 'HIGH' ? 'bg-orange-50 border-orange-200' :
                                            priority === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' :
                                                'bg-blue-50 border-blue-200'
                                    }`}>
                                    <div className="text-xs font-medium text-gray-500 uppercase">{priority}</div>
                                    <div className="text-2xl font-bold text-gray-900">{count}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}
