'use client';

import React from 'react';
import { useTimeline } from '../context/TimelineContext';
import { TimelineActionType } from '../types/processTypes';

interface CaseTimelineProps {
    caseId: string;
}

export default function CaseTimeline({ caseId }: CaseTimelineProps) {
    const { getTimelineByCaseId } = useTimeline();
    const timeline = getTimelineByCaseId(caseId);

    // Helper to get icon for action type
    const getActionIcon = (type: TimelineActionType) => {
        switch (type) {
            case 'CASE_CREATED':
                return (
                    <div className="bg-green-100 text-green-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                );
            case 'STATUS_CHANGED':
                return (
                    <div className="bg-blue-100 text-blue-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </div>
                );
            case 'ASSIGNED':
            case 'REASSIGNED':
                return (
                    <div className="bg-purple-100 text-purple-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                );
            case 'DOCUMENT_UPLOADED':
                return (
                    <div className="bg-amber-100 text-amber-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>
                );
            case 'DOCUMENT_VERIFIED':
                return (
                    <div className="bg-teal-100 text-teal-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                );
            case 'DOCUMENT_REJECTED':
                return (
                    <div className="bg-red-100 text-red-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                );
            default:
                return (
                    <div className="bg-gray-100 text-gray-600 p-1.5 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                );
        }
    };

    if (timeline.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500">
                No activity recorded yet.
            </div>
        );
    }

    return (
        <div className="flow-root">
            <ul className="-mb-8">
                {timeline.map((entry, idx) => (
                    <li key={entry.entryId}>
                        <div className="relative pb-8">
                            {idx !== timeline.length - 1 ? (
                                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                            ) : null}
                            <div className="relative flex space-x-3">
                                <div>{getActionIcon(entry.actionType)}</div>
                                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                    <div>
                                        <p className="text-sm text-gray-900">
                                            {entry.action}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            by <span className="font-medium text-gray-900">{entry.performedByName}</span>
                                        </p>
                                    </div>
                                    <div className="whitespace-nowrap text-right text-xs text-gray-500">
                                        <time dateTime={entry.performedAt}>
                                            {new Date(entry.performedAt).toLocaleDateString()}
                                        </time>
                                        <div className="mt-0.5">
                                            {new Date(entry.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
