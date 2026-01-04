'use client';

import React, { useState } from 'react';
import { useUsers } from '../context/UserContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import { User, UserRole } from '../types/processTypes';

export default function UsersPage() {
    const { users, createUser, updateUser, deleteUser, currentUser } = useUsers();

    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<Partial<User>>({});
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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

    return (
        <RoleGuard allowedRoles={['ADMIN']} fallback={<AccessDenied />}>
            <div className="p-6 max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                    <button
                        onClick={() => {
                            resetForm();
                            setIsEditing(true);
                        }}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        Add New User
                    </button>
                </div>

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
                                    <option value="SALES">Sales</option>
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
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' :
                                            user.role === 'PROCESS_MANAGER' ? 'bg-indigo-100 text-indigo-800' :
                                                user.role === 'PROCESS_EXECUTIVE' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-green-100 text-green-800'
                                            }`}>
                                            {user.role}
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
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {user.userId !== 'admin-001' && user.userId !== currentUser?.userId && (
                                            <button
                                                onClick={() => handleDelete(user.userId)}
                                                className="text-red-600 hover:text-red-900 ml-4"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </RoleGuard>
    );
}
