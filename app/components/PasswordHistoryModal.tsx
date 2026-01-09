import React from 'react';
import { PasswordHistoryEntry } from '../types/processTypes';

interface PasswordHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    userName: string;
    history?: PasswordHistoryEntry[];
}

export default function PasswordHistoryModal({ isOpen, onClose, userName, history = [] }: PasswordHistoryModalProps) {
    if (!isOpen) return null;

    // Sort history by timestamp descending (newest first)
    const sortedHistory = [...history].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-2xl mx-4 shadow-xl flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Password Change History</h2>
                        <p className="text-sm text-gray-500 mt-1">History for {userName}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {sortedHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No password changes recorded yet.
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Old Password</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Password</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changed By</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {sortedHistory.map((entry, index) => (
                                    <tr key={index}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-800">
                                                {entry.oldPassword}
                                            </code>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-800">
                                                {entry.newPassword}
                                            </code>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${entry.type === 'SELF'
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                {entry.type === 'SELF' ? 'Self' : 'Admin Reset'}
                                            </span>
                                            {entry.type === 'ADMIN_RESET' && (
                                                <div className="text-xs text-gray-400 mt-1">{entry.changedByName}</div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
