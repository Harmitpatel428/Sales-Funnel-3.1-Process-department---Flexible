'use client';

import React from 'react';
import { Case, CasePriority } from '../types/processTypes';
import { CaseStatusBadge } from './CaseStatusBadge';

interface CaseCardProps {
    caseData: Case;
    onClick?: (caseData: Case) => void;
    showAssignee?: boolean;
    assigneeName?: string;
}

/**
 * Priority configuration
 */
const PRIORITY_CONFIG: Record<CasePriority, {
    label: string;
    color: string;
    bgColor: string;
}> = {
    'LOW': { label: 'Low', color: 'text-gray-500', bgColor: 'bg-gray-100' },
    'MEDIUM': { label: 'Medium', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    'HIGH': { label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    'URGENT': { label: 'Urgent', color: 'text-red-600', bgColor: 'bg-red-100' }
};

/**
 * CaseCard Component
 * 
 * Displays a case summary card for list views.
 */
export function CaseCard({ caseData, onClick, showAssignee = true, assigneeName }: CaseCardProps) {
    const priorityConfig = PRIORITY_CONFIG[caseData.priority];

    return (
        <div
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onClick?.(caseData)}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-500">{caseData.caseNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.color}`}>
                            {priorityConfig.label}
                        </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-1 line-clamp-1">
                        {caseData.clientName || 'Unnamed Client'}
                    </h3>
                </div>
                <CaseStatusBadge status={caseData.processStatus} size="sm" />
            </div>

            {/* Details */}
            <div className="space-y-1 text-sm text-gray-600">
                {caseData.company && (
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span className="line-clamp-1">{caseData.company}</span>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span className="line-clamp-1">{caseData.schemeType}</span>
                </div>

                {caseData.mobileNumber && (
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{caseData.mobileNumber}</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                {showAssignee && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>{assigneeName || (caseData.assignedProcessUserId ? 'Assigned' : 'Unassigned')}</span>
                    </div>
                )}

                <div className="flex items-center gap-1 text-xs text-gray-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{new Date(caseData.updatedAt).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    );
}

export default CaseCard;
