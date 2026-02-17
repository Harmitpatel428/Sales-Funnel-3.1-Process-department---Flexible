'use client';

import React, { useState, useEffect } from 'react';
import { useUsers } from '../context/UserContext';

interface LoginModalProps {
    isOpen?: boolean;
    onLoginSuccess?: () => void;
}

/**
 * LoginModal Component
 * 
 * Modal for user authentication. Shows when user is not logged in.
 */
import MFAVerificationModal from './MFAVerificationModal';

export function LoginModal({ isOpen = true, onLoginSuccess }: LoginModalProps) {
    const { login, refreshUser, isAuthenticated, isLoading } = useUsers(); // Add refreshUser to update context after MFA

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // MFA State
    const [showMfa, setShowMfa] = useState(false);
    const [mfaUserId, setMfaUserId] = useState<string | null>(null);

    // Clear error when inputs change
    useEffect(() => {
        setError('');
    }, [username, password]);

    // If already authenticated or modal is closed, don't render
    if (isAuthenticated || !isOpen || isLoading) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username.trim()) {
            setError('Please enter username');
            return;
        }

        if (!password) {
            setError('Please enter password');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const result = await login(username.trim(), password, rememberMe);

            if (result.success) {
                onLoginSuccess?.();
            } else if (result.mfaRequired && result.userId) {
                setMfaUserId(result.userId);
                setShowMfa(true);
            } else {
                // More specific error handling
                const message = result.message || 'Login failed';
                if (message.includes('locked')) {
                    setError('Account is locked due to too many failed attempts. Please try again later or contact support.');
                } else if (message.includes('deactivated') || message.includes('inactive')) {
                    setError('Your account has been deactivated. Please contact your administrator.');
                } else if (message.includes('expired')) {
                    setError('Your password has expired. Please reset your password.');
                } else {
                    setError(message);
                }
            }
        } catch (err: any) {
            // Network or transient error handling
            console.error('Login error:', err);
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                setError('Network error. Please check your connection and try again.');
            } else {
                setError('Login failed. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMfaVerify = async (code: string, isBackup: boolean) => {
        if (!mfaUserId) return false;

        setIsSubmitting(true); // Add loading state during MFA verification

        try {
            const res = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: mfaUserId, code, useBackupCode: isBackup }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                // Refresh user context to get session data
                await refreshUser();
                onLoginSuccess?.();
                setShowMfa(false);
                return true;
            } else {
                // Show specific MFA error messages
                const errorMessage = data.message || data.error;
                if (isBackup && errorMessage?.includes('already used')) {
                    setError('This backup code has already been used. Please try a different code.');
                } else if (errorMessage?.includes('expired')) {
                    setError('Verification code has expired. Please request a new one.');
                } else if (errorMessage?.includes('invalid')) {
                    setError('Invalid verification code. Please try again.');
                } else {
                    setError(errorMessage || 'MFA verification failed.');
                }
                return false;
            }
        } catch (err) {
            console.error('MFA verification error:', err);
            setError('MFA verification failed. Please try again.');
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    if (showMfa) {
        return (
            <MFAVerificationModal
                isOpen={true}
                onVerify={handleMfaVerify}
                onCancel={() => { setShowMfa(false); setMfaUserId(null); }}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-8 text-white text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold">Welcome Back</h2>
                    <p className="text-purple-200 mt-1 text-sm">Sign in to continue to CRM</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center">
                            <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* Username */}
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                            Username
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-black placeholder:text-black"
                                placeholder="Enter username"
                                autoComplete="username"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                            Password
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full pl-10 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-black placeholder:text-black"
                                placeholder="Enter password"
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Remember Me */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                name="remember-me"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                            />
                            <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                                Remember me
                            </label>
                        </div>
                        <div className="text-sm">
                            <a href="/forgot-password" className="font-medium text-purple-600 hover:text-purple-500">
                                Forgot password?
                            </a>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Signing in...
                            </span>
                        ) : (
                            'Sign In'
                        )}
                    </button>

                    {/* Security Notice */}
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs text-gray-500 text-center">
                            Your session is protected with secure, server-validated authentication.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default LoginModal;
