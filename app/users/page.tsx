'use client';

import React, { useState, useEffect } from 'react';
import { useUsers } from '../context/UserContext';
import { useImpersonation } from '../context/ImpersonationContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import { User, UserRole, PasswordHistoryEntry } from '../types/processTypes';
import AuditLogViewer from '../components/AuditLogViewer';
import PasswordHistoryModal from '../components/PasswordHistoryModal';

export default function UsersPage() {
    const { users, createUser, updateUser, deleteUser, resetUserPassword, currentUser } = useUsers();
    const { startImpersonation, canImpersonate } = useImpersonation();

    const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<Partial<User>>({});
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [resetPasswordModal, setResetPasswordModal] = useState<{ isOpen: boolean; userId: string; userName: string; newPassword: string | null }>(
        { isOpen: false, userId: '', userName: '', newPassword: null }
    );

    // Password history modal state
    const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; userId: string; userName: string; history: PasswordHistoryEntry[] }>({
        isOpen: false, userId: '', userName: '', history: []
    });

    // Handle impersonation start using context
    const handleStartImpersonation = async (user: User) => {
        const result = await startImpersonation(user.userId);

        if (result.success) {
            setSuccess(result.message);
            // Redirect to home after successful impersonation
            setTimeout(() => window.location.href = '/', 500);
        } else {
            setError(result.message);
            setTimeout(() => setError(''), 3000);
        }
    };

    const resetForm = () => {
        setEditingUser({});
        setIsEditing(false);
        setError('');
        setSuccess('');
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser.username || !editingUser.password || !editingUser.name || !editingUser.email || !editingUser.role) {
            setError('All fields are required');
            return;
        }

        const result = createUser({
            username: editingUser.username,
            password: editingUser.password,
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role as UserRole,
            isActive: true
        });

        if (result.success) {
            setSuccess(result.message);
            setTimeout(resetForm, 2000);
        } else {
            setError(result.message);
        }
    };

    const handleDelete = (userId: string) => {
        if (confirm('Are you sure you want to delete this user?')) {
            const result = deleteUser(userId);
            if (result.success) {
                setSuccess(result.message);
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(result.message);
            }
        }
    };

    const handleResetPassword = (userId: string, userName: string) => {
        if (confirm(`Are you sure you want to reset the password for ${userName}? This will generate a new random password.`)) {
            const result = resetUserPassword(userId);
            if (result.success && result.newPassword) {
                setResetPasswordModal({
                    isOpen: true,
                    userId,
                    userName,
                    newPassword: result.newPassword
                });
            } else {
                setError(result.message);
                setTimeout(() => setError(''), 3000);
            }
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setSuccess('Password copied to clipboard!');
            setTimeout(() => setSuccess(''), 2000);
        });
    };

    const handleViewHistory = (user: User) => {
        setHistoryModal({
            isOpen: true,
            userId: user.userId,
            userName: user.name,
            history: user.passwordHistory || []
        });
    };

    const closePasswordModal = () => {
        setResetPasswordModal({ isOpen: false, userId: '', userName: '', newPassword: null });
    };

    // Auto-dismiss password modal after 10 seconds
    useEffect(() => {
        if (resetPasswordModal.isOpen && resetPasswordModal.newPassword) {
            const timer = setTimeout(() => {
                closePasswordModal();
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [resetPasswordModal.isOpen, resetPasswordModal.newPassword]);

    return (
        <RoleGuard allowedRoles={['ADMIN']} fallback={<AccessDenied />}>
            <div className="p-6 max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                    {activeTab === 'users' && (
                        <button
                            onClick={() => {
                                resetForm();
                                setIsEditing(true);
                            }}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Add New User
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'users'
                            ? 'border-purple-600 text-purple-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Users
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'audit'
                            ? 'border-purple-600 text-purple-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Audit Logs
                    </button>
                </div>

                {activeTab === 'audit' ? (
                    <AuditLogViewer />
                ) : (
                    <>

                        {/* Messages */}
                        {error && (
                            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                                {success}
                            </div>
                        )}

                        {/* Add User Form */}
                        {isEditing && (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                                <h2 className="text-lg font-semibold mb-4 text-gray-900">Create New User</h2>
                                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                        <input
                                            type="text"
                                            value={editingUser.name || ''}
                                            onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 text-black placeholder:text-black"
                                            placeholder="Full Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={editingUser.username || ''}
                                            onChange={e => setEditingUser({ ...editingUser, username: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 text-black placeholder:text-black"
                                            placeholder="username"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={editingUser.email || ''}
                                            onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 text-black placeholder:text-black"
                                            placeholder="email@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                        <select
                                            value={editingUser.role || ''}
                                            onChange={e => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-black"
                                        >
                                            <option value="">Select Role</option>
                                            <option value="SALES_EXECUTIVE">Sales Executive</option>
                                            <option value="SALES_MANAGER">Sales Manager</option>
                                            <option value="PROCESS_EXECUTIVE">Process Executive</option>
                                            <option value="PROCESS_MANAGER">Process Manager</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={editingUser.password || ''}
                                            onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 text-black placeholder:text-black"
                                            placeholder="Password"
                                        />
                                    </div>

                                    <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                                        >
                                            Create User
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Users List */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Password</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {users.map(user => (
                                        <tr key={user.userId}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="flex-shrink-0 h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                                        <div className="text-sm text-gray-500">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm text-gray-900 font-mono">{user.username}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {user.plainPassword ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-gray-900 font-mono">{user.plainPassword}</span>
                                                        <button
                                                            onClick={() => copyToClipboard(user.plainPassword!)}
                                                            className="text-purple-600 hover:text-purple-800 transition-colors"
                                                            title="Copy password"
                                                        >
                                                            📋
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400 font-mono" title="Password not yet available (user created before this feature)">
                                                        ••••••••
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' :
                                                    user.role === 'PROCESS_MANAGER' ? 'bg-indigo-100 text-indigo-800' :
                                                        user.role === 'PROCESS_EXECUTIVE' ? 'bg-blue-100 text-blue-800' :
                                                            user.role === 'SALES_MANAGER' ? 'bg-purple-100 text-purple-800' :
                                                                'bg-green-100 text-green-800'
                                                    }`}>
                                                    {user.role.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {user.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                                {user.userId !== 'admin-001' && user.userId !== currentUser?.userId && (
                                                    <>
                                                        {user.role !== 'ADMIN' && user.isActive && (
                                                            <button
                                                                onClick={() => handleStartImpersonation(user)}
                                                                className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1"
                                                                title={`View as ${user.name}`}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                                View As
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleResetPassword(user.userId, user.name)}
                                                            className="text-amber-600 hover:text-amber-900"
                                                        >
                                                            Reset PW
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(user.userId)}
                                                            className="text-red-600 hover:text-red-900"
                                                        >
                                                            Delete
                                                        </button>
                                                        <button
                                                            onClick={() => handleViewHistory(user)}
                                                            className="text-blue-600 hover:text-blue-900"
                                                        >
                                                            History
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Password Reset Modal */}
                        {resetPasswordModal.isOpen && resetPasswordModal.newPassword && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-gray-900">Password Reset Successful</h3>
                                        <button
                                            onClick={closePasswordModal}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-4">
                                        New password for <strong>{resetPasswordModal.userName}</strong>:
                                    </p>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between mb-4">
                                        <code className="text-lg font-mono text-gray-900 select-all">
                                            {resetPasswordModal.newPassword}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(resetPasswordModal.newPassword!)}
                                            className="ml-3 px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                                        <p className="text-sm text-amber-800">
                                            ⚠️ Please share this password with the user securely. They should change it after logging in.
                                        </p>
                                    </div>
                                    <p className="text-xs text-gray-400 text-center">
                                        This dialog will auto-close in 10 seconds
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Password History Modal */}
                        <PasswordHistoryModal
                            isOpen={historyModal.isOpen}
                            onClose={() => setHistoryModal({ ...historyModal, isOpen: false })}
                            userName={historyModal.userName}
                            history={historyModal.history}
                        />
                    </>
                )}
            </div>
        </RoleGuard>
    );
}
