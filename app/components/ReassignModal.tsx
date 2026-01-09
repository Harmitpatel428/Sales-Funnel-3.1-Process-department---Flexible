'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { UserRole } from '../types/processTypes';

interface ReassignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (userId: string, role: UserRole) => void;
    title?: string;
    subtitle?: string;
    caseCount?: number;
    caseNumber?: string;
    getUsersByRole: (role: UserRole) => { userId: string; name: string }[];
    defaultRole?: UserRole;
    defaultUserId?: string;
}

const ReassignModal = React.memo(function ReassignModal({
    isOpen,
    onClose,
    onSubmit,
    title,
    subtitle,
    caseCount,
    caseNumber,
    getUsersByRole,
    defaultRole = 'PROCESS_EXECUTIVE',
    defaultUserId = ''
}: ReassignModalProps) {
    const [selectedRole, setSelectedRole] = useState<UserRole>(defaultRole);
    const [selectedUserId, setSelectedUserId] = useState<string>(defaultUserId);
    const [customTitle, setCustomTitle] = useState(title);
    const [customSubtitle, setCustomSubtitle] = useState(subtitle);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedRole(defaultRole);
            setSelectedUserId(defaultUserId);
        }
    }, [isOpen, defaultRole, defaultUserId]);

    // Derived content if not explicitly provided
    useEffect(() => {
        if (!title) {
            setCustomTitle(caseCount && caseCount > 1 ? 'Bulk Reassign Cases' : 'Reassign Case');
        } else {
            setCustomTitle(title);
        }

        if (!subtitle) {
            if (caseCount && caseCount > 1) {
                setCustomSubtitle(`Assigning ${caseCount} selected cases`);
            } else if (caseNumber) {
                setCustomSubtitle(`Reassigning case: ${caseNumber}`);
            } else {
                setCustomSubtitle('Select a new user for this assignment');
            }
        } else {
            setCustomSubtitle(subtitle);
        }
    }, [title, subtitle, caseCount, caseNumber]);

    const usersForRole = useMemo(() => {
        return getUsersByRole(selectedRole);
    }, [selectedRole, getUsersByRole]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (selectedUserId) {
            onSubmit(selectedUserId, selectedRole);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{customTitle}</h3>
                <p className="text-sm text-gray-500 mb-4">
                    {customSubtitle}
                    {caseCount && caseCount > 1 && (
                        <span className="block mt-1 text-xs text-amber-600">
                            Note: This will update assignment for {caseCount} cases.
                        </span>
                    )}
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select Role
                        </label>
                        <select
                            value={selectedRole}
                            onChange={(e) => {
                                setSelectedRole(e.target.value as UserRole);
                                setSelectedUserId('');
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-black"
                        >
                            <option value="PROCESS_MANAGER">Process Manager</option>
                            <option value="PROCESS_EXECUTIVE">Process Executive</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select User
                        </label>
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-black"
                        >
                            <option value="" className="text-black">Select a user...</option>
                            {usersForRole.map(user => (
                                <option key={user.userId} value={user.userId}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                        {usersForRole.length === 0 && (
                            <p className="text-sm text-amber-600 mt-1">
                                No active users found for this role
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedUserId}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Reassign
                    </button>
                </div>
            </div>
        </div>
    );
});

ReassignModal.displayName = 'ReassignModal';

export default ReassignModal;
