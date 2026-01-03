'use client';

import React from 'react';
import { ProcessStatus } from '../types/processTypes';

interface CaseStatusBadgeProps {
    status: ProcessStatus;
    size?: 'sm' | 'md' | 'lg';
    showIcon?: boolean;
}

/**
 * Status configuration with colors and icons
 */
const STATUS_CONFIG: Record<ProcessStatus, {
    label: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    icon: string;
}> = {
    'DOCUMENTS_PENDING': {
        label: 'Documents Pending',
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-700',
        borderColor: 'border-amber-200',
        icon: '📋'
    },
    'DOCUMENTS_RECEIVED': {
        label: 'Documents Received',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
        icon: '📥'
    },
    'VERIFICATION': {
        label: 'Verification',
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-700',
        borderColor: 'border-purple-200',
        icon: '🔍'
    },
    'SUBMITTED': {
        label: 'Submitted',
        bgColor: 'bg-indigo-50',
        textColor: 'text-indigo-700',
        borderColor: 'border-indigo-200',
        icon: '📤'
    },
    'QUERY_RAISED': {
        label: 'Query Raised',
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-200',
        icon: '❓'
    },
    'APPROVED': {
        label: 'Approved',
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
        icon: '✅'
    },
    'REJECTED': {
        label: 'Rejected',
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
        icon: '❌'
    },
    'CLOSED': {
        label: 'Closed',
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200',
        icon: '🔒'
    }
};

/**
 * CaseStatusBadge Component
 * 
 * Displays a colored badge for case status.
 */
export function CaseStatusBadge({ status, size = 'md', showIcon = true }: CaseStatusBadgeProps) {
    const config = STATUS_CONFIG[status];

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-sm',
        lg: 'px-3 py-1.5 text-base'
    };

    return (
        <span
            className={`
        inline-flex items-center gap-1 rounded-full font-medium border
        ${config.bgColor} ${config.textColor} ${config.borderColor}
        ${sizeClasses[size]}
      `}
        >
            {showIcon && <span>{config.icon}</span>}
            {config.label}
        </span>
    );
}

/**
 * Get status configuration for external use
 */
export function getStatusConfig(status: ProcessStatus) {
    return STATUS_CONFIG[status];
}

/**
 * Get all statuses in order (for pipeline view)
 */
export const STATUS_ORDER: ProcessStatus[] = [
    'DOCUMENTS_PENDING',
    'DOCUMENTS_RECEIVED',
    'VERIFICATION',
    'SUBMITTED',
    'QUERY_RAISED',
    'APPROVED',
    'REJECTED',
    'CLOSED'
];

export default CaseStatusBadge;
