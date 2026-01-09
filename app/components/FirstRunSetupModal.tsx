'use client';

import React, { useState, useEffect } from 'react';
import { usePasswords } from '../context/PasswordContext';

interface FirstRunSetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const FirstRunSetupModal: React.FC<FirstRunSetupModalProps> = ({
  isOpen,
  onComplete
}) => {
  const [step, setStep] = useState<'intro' | 'setup' | 'confirm'>('intro');
  const [masterPassphrase, setMasterPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [understoodWarning, setUnderstoodWarning] = useState(false);

  const {
    changePassword,
    getPasswordStrength
  } = usePasswords();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setMasterPassphrase('');
      setConfirmPassphrase('');
      setShowPassphrase(false);
      setError('');
      setIsLoading(false);
      setUnderstoodWarning(false);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (step === 'intro') {
      setStep('setup');
    }
  };

  const handleSetupNext = () => {
    const strength = getPasswordStrength(masterPassphrase);
    if (strength.score < 3) {
      setError('Please choose a stronger passphrase. Minimum strength score required: 3/5');
      return;
    }
    setStep('confirm');
    setError('');
  };

  const handleComplete = async () => {
    if (masterPassphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    if (!understoodWarning) {
      setError('Please confirm that you understand the warning');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Set up the master password for edit mode
      const success = await changePassword('editMode', masterPassphrase);
      if (success) {
        // Clear passphrase from memory
        setMasterPassphrase('');
        setConfirmPassphrase('');
        onComplete();
      } else {
        setError('Setup failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred during setup. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(masterPassphrase);
  const strengthColor = passwordStrength.score <= 2 ? 'text-red-600' :
    passwordStrength.score <= 3 ? 'text-yellow-600' : 'text-green-600';
  const strengthText = passwordStrength.score <= 2 ? 'Weak' :
    passwordStrength.score <= 3 ? 'Medium' : 'Strong';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-md mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {step === 'intro' && 'Welcome to Secure Setup'}
            {step === 'setup' && 'Create Master Passphrase'}
            {step === 'confirm' && 'Confirm Setup'}
          </h2>
        </div>

        {step === 'intro' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">What is a Master Passphrase?</h3>
              <p className="text-sm text-blue-700 mb-3">
                Your master passphrase encrypts all your passwords and sensitive data. This ensures your information is protected even if someone gains access to your device.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Important: If you forget this passphrase, you cannot recover your passwords. Please store it securely.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">Security Features:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• AES-256-GCM encryption for all passwords</li>
                <li>• PBKDF2 key derivation with 100,000 iterations</li>
                <li>• Automatic strong password generation</li>
                <li>• Session-based security tokens</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              Continue to Setup
            </button>
          </div>
        )}

        {step === 'setup' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Master Passphrase
              </label>
              <div className="relative">
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={masterPassphrase}
                  onChange={(e) => setMasterPassphrase(e.target.value)}
                  placeholder="Enter a strong passphrase"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={isLoading}
                >
                  {showPassphrase ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Password Strength Indicator */}
            {masterPassphrase && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Strength:</span>
                  <span className={`text-sm font-medium ${strengthColor}`}>
                    {strengthText} ({passwordStrength.score}/5)
                  </span>
                </div>
                <progress
                  className={`password-strength-progress w-full h-2 rounded-full transition-all duration-300 ${passwordStrength.score <= 2 ? 'text-red-500' :
                      passwordStrength.score <= 3 ? 'text-yellow-500' : 'text-green-500'
                    }`}
                  value={passwordStrength.score}
                  max={5}
                  aria-label={`Password strength: ${passwordStrength.score} out of 5`}
                  aria-describedby="password-strength-description"
                />
                <div id="password-strength-description" className="sr-only">
                  Password strength is {passwordStrength.score} out of 5, which is {strengthText.toLowerCase()}.
                </div>
              </div>
            )}

            {/* Requirements */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Requirements:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li className={masterPassphrase.length >= 8 ? 'text-green-600' : ''}>
                  ✓ At least 8 characters
                </li>
                <li className={/[a-z]/.test(masterPassphrase) ? 'text-green-600' : ''}>
                  ✓ Contains lowercase letter
                </li>
                <li className={/[A-Z]/.test(masterPassphrase) ? 'text-green-600' : ''}>
                  ✓ Contains uppercase letter
                </li>
                <li className={/[0-9]/.test(masterPassphrase) ? 'text-green-600' : ''}>
                  ✓ Contains number
                </li>
                <li className={/[^A-Za-z0-9]/.test(masterPassphrase) ? 'text-green-600' : ''}>
                  ✓ Contains special character
                </li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setStep('intro')}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSetupNext}
                disabled={isLoading || passwordStrength.score < 3}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Master Passphrase
              </label>
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Re-enter your passphrase"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="understoodWarning"
                  checked={understoodWarning}
                  onChange={(e) => setUnderstoodWarning(e.target.checked)}
                  className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  disabled={isLoading}
                />
                <label htmlFor="understoodWarning" className="ml-3 text-sm text-red-800">
                  I understand that if I forget this passphrase, I cannot recover my passwords and will need to reset all data.
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setStep('setup')}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={isLoading || !understoodWarning || masterPassphrase !== confirmPassphrase}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirstRunSetupModal;
