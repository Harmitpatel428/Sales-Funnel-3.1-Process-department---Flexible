'use client';

import React, { useState, useEffect } from 'react';
import { usePasswords } from '../context/PasswordContext';

interface PasswordSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordChanged?: () => void;
}

const PasswordSettingsModal: React.FC<PasswordSettingsModalProps> = ({
  isOpen,
  onClose,
  onPasswordChanged
}) => {
  const [activeOperation, setActiveOperation] = useState<keyof typeof operationLabels | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    changePassword,
    getPasswordStrength,
    resetPassword,
    isPasswordExpired,
    verifyPassword
  } = usePasswords();

  const operationLabels = {
    editMode: 'Edit Mode',
    headerEdit: 'Header Edit',
    export: 'Export',
    columnManagement: 'Column Management',
    rowManagement: 'Row Management',
    caseManagement: 'Case Management'
  };

  const operationDescriptions = {
    editMode: 'Password required to enter edit mode',
    headerEdit: 'Password required to edit table headers',
    export: 'Password required to export data',
    columnManagement: 'Password required to manage columns',
    rowManagement: 'Password required to manage rows',
    caseManagement: 'Password required to manage cases'
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setActiveOperation(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match.');
        return;
      }

      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }

      // Verify current password first
      if (!verifyPassword(activeOperation!, currentPassword)) {
        setError('Current password is incorrect.');
        setIsLoading(false);
        return;
      }

      if (await changePassword(activeOperation!, newPassword)) {
        setSuccess(`Password for ${operationLabels[activeOperation!]} updated successfully.`);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setActiveOperation(null);
        onPasswordChanged?.();
      } else {
        setError('Failed to update password. Please try again.');
      }
    } catch (err) {
      // ...
    }
  };

  const handleResetPassword = async (operation: keyof typeof operationLabels) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (await resetPassword(operation)) {
        setSuccess(`Password for ${operationLabels[operation]} reset to default.`);
        onPasswordChanged?.();
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const getStrengthColor = (score: number) => {
    if (score <= 2) return 'text-red-600';
    if (score <= 3) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStrengthText = (score: number) => {
    if (score <= 2) return 'Weak';
    if (score <= 3) return 'Medium';
    return 'Strong';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">Password Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        {!activeOperation ? (
          <div className="space-y-4">
            <p className="text-gray-600 mb-6">
              Manage passwords for different operations. Each operation can have its own password for enhanced security.
            </p>

            {Object.entries(operationLabels).map(([operation, label]) => (
              <div key={operation} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-800">{label}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {operationDescriptions[operation as keyof typeof operationDescriptions]}
                    </p>
                    {isPasswordExpired(operation as keyof typeof operationLabels) && (
                      <p className="text-sm text-red-600 mt-1">⚠️ Password expired</p>
                    )}
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => setActiveOperation(operation as keyof typeof operationLabels)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      disabled={isLoading}
                    >
                      Change
                    </button>
                    <button
                      onClick={() => handleResetPassword(operation as keyof typeof operationLabels)}
                      className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                      disabled={isLoading}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center mb-6">
              <button
                onClick={() => setActiveOperation(null)}
                className="text-blue-600 hover:text-blue-800 mr-4"
                disabled={isLoading}
              >
                ← Back
              </button>
              <h3 className="text-lg font-medium text-gray-800">
                Change Password: {operationLabels[activeOperation]}
              </h3>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showCurrentPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">Strength:</span>
                      <span className={`text-sm font-medium ${getStrengthColor(passwordStrength.score)}`}>
                        {getStrengthText(passwordStrength.score)}
                      </span>
                    </div>
                    {passwordStrength.feedback.length > 0 && (
                      <ul className="text-xs text-gray-600 mt-1">
                        {passwordStrength.feedback.map((feedback, index) => (
                          <li key={index}>• {feedback}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                  {success}
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading || newPassword !== confirmPassword || passwordStrength.score < 2}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Updating...' : 'Update Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOperation(null)}
                  disabled={isLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default PasswordSettingsModal;
