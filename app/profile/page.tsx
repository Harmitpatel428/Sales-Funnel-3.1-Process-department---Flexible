'use client';

import React, { useState, useMemo } from 'react';
import { useUsers } from '../context/UserContext';
import RoleGuard from '../components/RoleGuard';

// Password strength checker
function checkPasswordStrength(password: string): { score: number; label: string; color: string } {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*]/.test(password)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { score, label: 'Medium', color: 'bg-yellow-500' };
    return { score, label: 'Strong', color: 'bg-green-500' };
}

export default function ProfilePage() {
    const { currentUser, changeOwnPassword } = useUsers();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // MFA Modals
    const [showMFASetup, setShowMFASetup] = useState(false);
    const [showMFAVerify, setShowMFAVerify] = useState(false); // For disabling


    const passwordStrength = useMemo(() => checkPasswordStrength(newPassword), [newPassword]);
    const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

    // Strict validation matching UserContext rules
    const hasMinLength = newPassword.length >= 8;
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*]/.test(newPassword);

    const isStrongEnough = hasMinLength && hasLowercase && hasUppercase && hasNumber && hasSpecialChar;

    const canSubmit = currentPassword.length > 0 &&
        isStrongEnough &&
        passwordsMatch &&
        !isSubmitting;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        const result = changeOwnPassword(currentPassword, newPassword);

        if (result.success) {
            setMessage({ type: 'success', text: result.message });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } else {
            setMessage({ type: 'error', text: result.message });
        }

        setIsSubmitting(false);
    };

    const handleEnableMFA = () => {
        setShowMFASetup(true);
    };

    const handleMFAComplete = async () => {
        setShowMFASetup(false);
        await refreshUser(); // Refresh checks
        setMessage({ type: 'success', text: 'MFA enabled successfully' });
    };

    const handleDisableMFA = async () => {
        if (!confirm('Are you sure you want to disable MFA? This decreases your account security.')) return;

        try {
            // Usually requires password or auth? For now simple API call.
            // But api/auth/mfa/disable requires { password } body.
            // I'll need a modal or prompt for password.
            // For simplicity, reusing "currentPassword" usage flow or just asking user to confirm via password prompt.
            // I'll assume usage of a prompt for now or just generic error if failed.
            const password = prompt("Please enter your password to confirm:");
            if (!password) return;

            const res = await fetch('/api/auth/mfa/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (res.ok) {
                await refreshUser();
                setMessage({ type: 'success', text: 'MFA disabled successfully' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to disable MFA' });
            }
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        }
    };

    return (
        <RoleGuard allowedRoles={['ADMIN', 'SALES_EXECUTIVE', 'SALES_MANAGER', 'PROCESS_EXECUTIVE', 'PROCESS_MANAGER']}>
            <div className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile Settings</h1>

                {/* User Information Card */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500">Name</label>
                            <p className="mt-1 text-gray-900">{currentUser?.name || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500">Username</label>
                            <p className="mt-1 text-gray-900">{currentUser?.username || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500">Email</label>
                            <p className="mt-1 text-gray-900">{currentUser?.email || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500">Role</label>
                            <p className="mt-1">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    {currentUser?.role.replace(/_/g, ' ') || '-'}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* MFA Section */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Multi-Factor Authentication (MFA)</h2>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-600 mb-2">
                                Add an extra layer of security to your account by enabling two-factor authentication.
                            </p>
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${currentUser?.mfaEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                    {currentUser?.mfaEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>
                        <div>
                            {currentUser?.mfaEnabled ? (
                                <button
                                    onClick={handleDisableMFA}
                                    className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-md text-sm font-medium border border-red-200"
                                >
                                    Disable MFA
                                </button>
                            ) : (
                                <button
                                    onClick={handleEnableMFA}
                                    className="bg-purple-600 text-white hover:bg-purple-700 px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    Enable MFA
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Change Password Card */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>

                    {message && (
                        <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Current Password */}
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                Current Password
                            </label>
                            <div className="relative">
                                <input
                                    id="currentPassword"
                                    type={showCurrentPassword ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                                    placeholder="Enter your current password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    {showCurrentPassword ? (
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* New Password */}
                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                New Password
                            </label>
                            <div className="relative">
                                <input
                                    id="newPassword"
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                                    placeholder="Enter your new password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    {showNewPassword ? (
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {/* Password Strength Indicator */}
                            {newPassword && (
                                <div className="mt-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                                                style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                                            />
                                        </div>
                                        <span className={`text-xs font-medium ${passwordStrength.label === 'Weak' ? 'text-red-600' :
                                            passwordStrength.label === 'Medium' ? 'text-yellow-600' : 'text-green-600'
                                            }`}>
                                            {passwordStrength.label}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                Confirm New Password
                            </label>
                            <div className="relative">
                                <input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-gray-900 ${confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="Confirm your new password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    {showConfirmPassword ? (
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {confirmPassword && !passwordsMatch && (
                                <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
                            )}
                        </div>

                        {/* Password Requirements */}
                        <div className="bg-gray-50 rounded-md p-4">
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Password Requirements:</h3>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li className={`flex items-center gap-2 ${newPassword.length >= 8 ? 'text-green-600' : ''}`}>
                                    {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
                                </li>
                                <li className={`flex items-center gap-2 ${/[a-z]/.test(newPassword) ? 'text-green-600' : ''}`}>
                                    {/[a-z]/.test(newPassword) ? '✓' : '○'} One lowercase letter
                                </li>
                                <li className={`flex items-center gap-2 ${/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}`}>
                                    {/[A-Z]/.test(newPassword) ? '✓' : '○'} One uppercase letter
                                </li>
                                <li className={`flex items-center gap-2 ${/[0-9]/.test(newPassword) ? 'text-green-600' : ''}`}>
                                    {/[0-9]/.test(newPassword) ? '✓' : '○'} One number
                                </li>
                                <li className={`flex items-center gap-2 ${/[!@#$%^&*]/.test(newPassword) ? 'text-green-600' : ''}`}>
                                    {/[!@#$%^&*]/.test(newPassword) ? '✓' : '○'} One special character (!@#$%^&*)
                                </li>
                            </ul>
                        </div>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${canSubmit
                                ? 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500'
                                : 'bg-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {isSubmitting ? 'Changing Password...' : 'Change Password'}
                        </button>
                    </form>
                </div>
            </div>

            {/* MFA Modals */}
            import MFASetupModal from '../components/MFASetupModal';
            <MFASetupModal
                isOpen={showMFASetup}
                onClose={() => setShowMFASetup(false)}
                onComplete={handleMFAComplete}
            />
        </RoleGuard>
    );
}
