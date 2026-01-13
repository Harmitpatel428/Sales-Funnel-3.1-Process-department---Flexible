'use client';

import React, { useState } from 'react';

interface MFAVerificationModalProps {
    isOpen: boolean;
    onVerify: (code: string, isBackup: boolean) => Promise<boolean>; // Returns true if success
    onCancel: () => void;
    availableMethods?: string[]; // TOTP, SMS, EMAIL
}

export default function MFAVerificationModal({ isOpen, onVerify, onCancel, availableMethods = ['TOTP'] }: MFAVerificationModalProps) {
    const [code, setCode] = useState('');
    const [isBackup, setIsBackup] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);
        try {
            const success = await onVerify(code, isBackup);
            if (!success) {
                setError("Invalid code. Please try again.");
            }
        } catch (err: any) {
            setError(err.message || "Verification failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 relative">
                <button onClick={onCancel} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    ✕
                </button>

                <h2 className="text-xl font-bold mb-4">
                    {isBackup ? 'Enter Backup Code' : 'Two-Factor Authentication'}
                </h2>

                <p className="text-gray-600 text-sm mb-4">
                    {isBackup
                        ? 'Enter one of your emergency backup codes.'
                        : 'Please enter the code from your authenticator app.'}
                </p>

                {error && (
                    <div className="bg-red-50 text-red-600 p-2 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.trim())}
                        className="w-full text-center text-2xl tracking-widest border p-2 rounded"
                        placeholder={isBackup ? "ABCD1234" : "123456"}
                        autoFocus
                    />

                    <button
                        type="submit"
                        disabled={isSubmitting || !code}
                        className="w-full bg-purple-600 text-white py-2 rounded disabled:opacity-50"
                    >
                        {isSubmitting ? 'Verifying...' : 'Verify'}
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <button
                        onClick={() => { setIsBackup(!isBackup); setCode(''); setError(null); }}
                        className="text-sm text-purple-600 hover:text-purple-800 underline"
                    >
                        {isBackup ? 'Use Authenticator Code' : 'Use Backup Code'}
                    </button>
                </div>
            </div>
        </div>
    );
}
