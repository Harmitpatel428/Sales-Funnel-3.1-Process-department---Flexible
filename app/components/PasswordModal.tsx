'use client';

import React, { useState, useEffect } from 'react';
import { usePasswords } from '../context/PasswordContext';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: 'editMode' | 'headerEdit' | 'export' | 'columnManagement' | 'rowManagement' | 'caseManagement';
  onSuccess: (reason?: string) => void;
  title?: string;
  description?: string;
  captureReason?: boolean; // New prop
}

const PasswordModal = React.memo<PasswordModalProps>(function PasswordModal({
  isOpen,
  onClose,
  operation,
  onSuccess,
  title,
  description,
  captureReason = false
}) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState(''); // State for reason
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    verifyPassword,
    getPasswordHint,
    getSecurityQuestion,
    verifySecurityAnswer,
    isPasswordExpired
  } = usePasswords();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setReason(''); // Reset reason
      setError('');
      setSecurityAnswer('');
      setShowSecurityQuestion(false);
      setRememberSession(false);
    }
  }, [isOpen]);

  // Check if password is expired
  useEffect(() => {
    if (isOpen && isPasswordExpired(operation)) {
      setError('Password has expired. Please contact administrator.');
    }
  }, [isOpen, operation, isPasswordExpired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (showSecurityQuestion) {
        if (verifySecurityAnswer(operation, securityAnswer)) {
          onSuccess(reason || undefined); // Pass reason
          if (rememberSession) {
            sessionStorage.setItem(`verified_${operation}`, 'true');
          }
          onClose();
        } else {
          setError('Incorrect security answer. Please try again.');
        }
      } else {
        if (verifyPassword(operation, password)) {
          onSuccess(reason || undefined); // Pass reason
          if (rememberSession) {
            sessionStorage.setItem(`verified_${operation}`, 'true');
          }
          onClose();
        } else {
          setError('Incorrect password. Please try again.');
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setShowSecurityQuestion(true);
    setPassword('');
    setError('');
  };

  const handleBackToPassword = () => {
    setShowSecurityQuestion(false);
    setSecurityAnswer('');
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  if (!isOpen) return null;

  const operationTitles = {
    editMode: 'Enter Edit Mode',
    headerEdit: 'Edit Headers',
    export: 'Export Data',
    columnManagement: 'Manage Columns',
    rowManagement: 'Manage Rows',
    caseManagement: 'Case Management'
  };

  const operationDescriptions = {
    editMode: 'Enter password to enable editing of lead data',
    headerEdit: 'Enter password to modify table headers and column settings',
    export: 'Enter password to export lead data to Excel',
    columnManagement: 'Enter password to add, delete, or reorder columns',
    rowManagement: 'Enter password to perform bulk row operations',
    caseManagement: 'Enter password to manage cases'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-xl"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {title || operationTitles[operation]}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          {description || operationDescriptions[operation]}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {showSecurityQuestion ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Security Question
              </label>
              <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-3 rounded">
                {getSecurityQuestion(operation)}
              </p>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Your answer"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                required
                disabled={isLoading}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={isLoading}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {getPasswordHint(operation)}
              </p>
            </div>
          )}

          {/* Reason Capture Field */}
          {captureReason && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (Optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-gray-400"
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="rememberSession"
              checked={rememberSession}
              onChange={(e) => setRememberSession(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={isLoading}
            />
            <label htmlFor="rememberSession" className="ml-2 block text-sm text-gray-700">
              Remember for this session
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {!showSecurityQuestion && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
                disabled={isLoading}
              >
                Forgot Password?
              </button>
            </div>
          )}

          {showSecurityQuestion && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleBackToPassword}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
                disabled={isLoading}
              >
                Back to Password
              </button>
            </div>
          )}
        </form>
      </div >
    </div >
  );
});

PasswordModal.displayName = 'PasswordModal';

export default PasswordModal;
