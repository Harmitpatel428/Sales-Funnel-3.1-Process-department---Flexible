'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  encryptData,
  decryptData,
  hasMasterKey,
  setMasterKey as setMasterKeyUtil,
  verifyMasterKey as verifyMasterKeyUtil,
  requiresFirstRunSetup,
  getEncryptionStatus as getEncryptionStatusUtil,
  clearMasterKey as clearMasterKeyUtil
} from '../utils/encryption';

// Password configuration interface
export interface PasswordConfig {
  editMode: string;
  headerEdit: string;
  export: string;
  columnManagement: string;
  rowManagement: string;
  caseManagement: string;
}

// Password context type
export interface PasswordContextType {
  verifyPassword: (operation: keyof PasswordConfig, password: string) => boolean;
  changePassword: (operation: keyof PasswordConfig, newPassword: string) => Promise<boolean>;
  getPasswordHint: (operation: keyof PasswordConfig) => string;
  getPasswordStrength: (password: string) => { score: number; feedback: string[] };
  isPasswordExpired: (operation: keyof PasswordConfig) => boolean;
  resetPassword: (operation: keyof PasswordConfig) => Promise<boolean>;
  getSecurityQuestion: (operation: keyof PasswordConfig) => string;
  verifySecurityAnswer: (operation: keyof PasswordConfig, answer: string) => boolean;
  setSecurityQuestion: (operation: keyof PasswordConfig, answer: string) => Promise<void>;

  // Encryption management
  setMasterKey: (passphrase: string) => Promise<boolean>;
  verifyMasterKey: (passphrase: string) => Promise<boolean>;
  getEncryptionStatus: () => {
    status: 'unset' | 'needsVerify' | 'ready' | 'error';
    hasMasterKey: boolean;
    requiresSetup: boolean;
    sensitiveKeysCount: number;
  };
  requiresSetup: () => boolean;
}

// Default passwords
const DEFAULT_PASSWORDS: PasswordConfig = {
  editMode: 'admin123',
  headerEdit: 'admin123',
  export: 'admin123',
  columnManagement: 'admin123',
  rowManagement: 'admin123',
  caseManagement: 'admin123'
};

// Password hints
const PASSWORD_HINTS: Record<keyof PasswordConfig, string> = {
  editMode: 'Password for entering edit mode',
  headerEdit: 'Password for editing table headers',
  export: 'Password for exporting data',
  columnManagement: 'Password for managing columns',
  rowManagement: 'Password for managing rows',
  caseManagement: 'Password for managing cases'
};

// Security questions
const SECURITY_QUESTIONS: Record<keyof PasswordConfig, string> = {
  editMode: 'What is the name of your first pet?',
  headerEdit: 'What city were you born in?',
  export: 'What is your mother\'s maiden name?',
  columnManagement: 'What was your first car?',
  rowManagement: 'What is your favorite color?',
  caseManagement: 'What is the name of your first pet?'
};

// Create context
const PasswordContext = createContext<PasswordContextType | undefined>(undefined);

// Password provider component
export const PasswordProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [passwords, setPasswords] = useState<PasswordConfig>(DEFAULT_PASSWORDS);
  const [securityAnswers, setSecurityAnswers] = useState<Record<keyof PasswordConfig, string>>({} as Record<keyof PasswordConfig, string>);
  const [passwordExpiry, setPasswordExpiry] = useState<Record<keyof PasswordConfig, number>>({} as Record<keyof PasswordConfig, number>);
  const [masterStatus, setMasterStatus] = useState<'unset' | 'needsVerify' | 'ready' | 'error'>('unset');

  // Initialize master key status
  useEffect(() => {
    if (requiresFirstRunSetup()) {
      setMasterStatus('unset');
    } else if (hasMasterKey()) {
      setMasterStatus('ready');
    } else {
      setMasterStatus('needsVerify');
    }
  }, []);

  // Load passwords from localStorage when master key is ready
  useEffect(() => {
    const loadData = async () => {
      if (requiresFirstRunSetup()) {
        setMasterStatus('unset');
        return;
      }

      if (!hasMasterKey()) {
        setMasterStatus('needsVerify');
        return;
      }

      const savedPasswords = localStorage.getItem('leadPasswordConfig');
      const savedAnswers = localStorage.getItem('leadSecurityAnswers');
      const savedExpiry = localStorage.getItem('leadPasswordExpiry');

      if (savedPasswords) {
        try {
          // Try to decrypt
          const decrypted = await decryptData(savedPasswords);
          const parsed = JSON.parse(decrypted);
          setPasswords({ ...DEFAULT_PASSWORDS, ...parsed });
        } catch (error) {
          console.warn('Failed to decrypt passwords, checking for legacy plaintext:', error);
          // Fallback: try parsing as plaintext (migration path)
          try {
            const parsed = JSON.parse(savedPasswords);
            setPasswords({ ...DEFAULT_PASSWORDS, ...parsed });
            // Should optionally trigger a re-save here to encrypt it
          } catch (parseError) {
            console.error('Error loading password config and legacy fallback failed:', parseError);
            // Strict Verbatim: On decrypt fail (and assuming invalid data if legacy also fails), remove item
            localStorage.removeItem('leadPasswordConfig');
            console.warn('Cleared invalid data for leadPasswordConfig');
            setPasswords(DEFAULT_PASSWORDS);
          }
        }
      }

      if (savedAnswers) {
        try {
          const decrypted = await decryptData(savedAnswers);
          setSecurityAnswers(JSON.parse(decrypted));
        } catch (error) {
          console.warn('Failed to decrypt security answers, checking for legacy plaintext:', error);
          try {
            setSecurityAnswers(JSON.parse(savedAnswers));
          } catch (parseError) {
            console.error('Error loading security answers and legacy fallback failed:', parseError);
            localStorage.removeItem('leadSecurityAnswers');
            console.warn('Cleared invalid data for leadSecurityAnswers');
          }
        }
      }

      if (savedExpiry) {
        try {
          // Expiry is not currently encrypted as it's not sensitive, but consistent
          setPasswordExpiry(JSON.parse(savedExpiry));
        } catch (error) {
          console.error('Error loading password expiry:', error);
        }
      }
    };

    if (masterStatus === 'ready') {
      loadData();
    }
  }, [masterStatus]);

  // Save passwords to localStorage (Encrypted)
  const savePasswords = async (newPasswords: PasswordConfig) => {
    if (!hasMasterKey()) {
      console.error('Master key required'); // Verbatim behavior implies error or block
      throw new Error('Master key required');
    }
    try {
      const encrypted = await encryptData(JSON.stringify(newPasswords));
      localStorage.setItem('leadPasswordConfig', encrypted);
      setPasswords(newPasswords);
    } catch (error) {
      console.error('Failed to encrypt and save passwords:', error);
      throw error;
    }
  };

  // Save security answers to localStorage (Encrypted)
  const saveSecurityAnswers = async (newAnswers: Record<keyof PasswordConfig, string>) => {
    if (!hasMasterKey()) {
      throw new Error('Master key required');
    }
    try {
      const encrypted = await encryptData(JSON.stringify(newAnswers));
      localStorage.setItem('leadSecurityAnswers', encrypted);
      setSecurityAnswers(newAnswers);
    } catch (error) {
      console.error('Failed to encrypt and save security answers:', error);
      throw error;
    }
  };

  // Save password expiry to localStorage (Not encrypted)
  const savePasswordExpiry = (newExpiry: Record<keyof PasswordConfig, number>) => {
    localStorage.setItem('leadPasswordExpiry', JSON.stringify(newExpiry));
    setPasswordExpiry(newExpiry);
  };

  // Verify password
  const verifyPassword = (operation: keyof PasswordConfig, password: string): boolean => {
    // If passwords aren't loaded yet (not ready), this might fail or return false.
    // Assuming UI prevents reaching here if not ready, or defaults handle it.
    return passwords[operation] === password;
  };

  // Change password
  const changePassword = async (operation: keyof PasswordConfig, newPassword: string): Promise<boolean> => {
    if (newPassword.length < 6) {
      return false;
    }

    if (masterStatus !== 'ready') {
      console.error('Cannot change password: Master key not ready');
      return false;
    }

    const newPasswords = { ...passwords, [operation]: newPassword };
    await savePasswords(newPasswords);

    // Set expiry to 90 days from now
    const expiryDate = Date.now() + (90 * 24 * 60 * 60 * 1000);
    const newExpiry = { ...passwordExpiry, [operation]: expiryDate };
    savePasswordExpiry(newExpiry);

    return true;
  };

  // Get password hint
  const getPasswordHint = (operation: keyof PasswordConfig): string => {
    return PASSWORD_HINTS[operation];
  };

  // Get password strength
  const getPasswordStrength = (password: string): { score: number; feedback: string[] } => {
    let score = 0;
    const feedback: string[] = [];

    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters long');

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Password should contain lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Password should contain uppercase letters');

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Password should contain numbers');

    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else feedback.push('Password should contain special characters');

    return { score, feedback };
  };

  // Check if password is expired
  const isPasswordExpired = (operation: keyof PasswordConfig): boolean => {
    const expiry = passwordExpiry[operation];
    if (!expiry) return false;
    return Date.now() > expiry;
  };

  // Reset password
  const resetPassword = async (operation: keyof PasswordConfig): Promise<boolean> => {
    if (masterStatus !== 'ready') return false;

    const newPasswords = { ...passwords, [operation]: DEFAULT_PASSWORDS[operation] };
    await savePasswords(newPasswords);

    // Refresh expiry on reset (Comment 3)
    const expiryDate = Date.now() + (90 * 24 * 60 * 60 * 1000);
    const newExpiry = { ...passwordExpiry, [operation]: expiryDate };
    savePasswordExpiry(newExpiry);

    return true;
  };

  // Get security question
  const getSecurityQuestion = (operation: keyof PasswordConfig): string => {
    return SECURITY_QUESTIONS[operation];
  };

  // Verify security answer
  const verifySecurityAnswer = (operation: keyof PasswordConfig, answer: string): boolean => {
    return securityAnswers[operation]?.toLowerCase() === answer.toLowerCase();
  };

  // Set security question and answer
  const setSecurityQuestion = async (operation: keyof PasswordConfig, answer: string): Promise<void> => {
    const newAnswers = { ...securityAnswers, [operation]: answer };
    await saveSecurityAnswers(newAnswers);
  };

  // Encryption Management Methods
  const setMasterKey = async (passphrase: string): Promise<boolean> => {
    const success = await setMasterKeyUtil(passphrase);
    if (success) {
      setMasterStatus('ready');
      // Proactively encrypt existing passwords when master key is first set
      await savePasswords(passwords);
      return true;
    }
    return false;
  };

  const verifyMasterKey = async (passphrase: string): Promise<boolean> => {
    const isValid = await verifyMasterKeyUtil(passphrase);
    if (isValid) {
      setMasterStatus('ready');
      return true;
    }
    return false;
  };

  const getEncryptionStatus = () => {
    const utilsStatus = getEncryptionStatusUtil();
    return {
      status: masterStatus,
      ...utilsStatus
    };
  };

  const requiresSetup = () => requiresFirstRunSetup();

  const contextValue: PasswordContextType = {
    verifyPassword,
    changePassword,
    getPasswordHint,
    getPasswordStrength,
    isPasswordExpired,
    resetPassword,
    getSecurityQuestion,
    verifySecurityAnswer,
    setSecurityQuestion,
    setMasterKey,
    verifyMasterKey,
    getEncryptionStatus,
    requiresSetup
  };

  return (
    <PasswordContext.Provider value={contextValue}>
      {children}
    </PasswordContext.Provider>
  );
};

// Hook to use password context
export const usePasswords = (): PasswordContextType => {
  const context = useContext(PasswordContext);
  if (context === undefined) {
    throw new Error('usePasswords must be used within a PasswordProvider');
  }
  return context;
};
