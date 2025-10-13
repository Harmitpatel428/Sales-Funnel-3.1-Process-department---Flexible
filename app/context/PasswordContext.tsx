'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Password configuration interface
export interface PasswordConfig {
  editMode: string;
  headerEdit: string;
  export: string;
  columnManagement: string;
  rowManagement: string;
}

// Password context type
export interface PasswordContextType {
  verifyPassword: (operation: keyof PasswordConfig, password: string) => boolean;
  changePassword: (operation: keyof PasswordConfig, newPassword: string) => boolean;
  getPasswordHint: (operation: keyof PasswordConfig) => string;
  getPasswordStrength: (password: string) => { score: number; feedback: string[] };
  isPasswordExpired: (operation: keyof PasswordConfig) => boolean;
  resetPassword: (operation: keyof PasswordConfig) => boolean;
  getSecurityQuestion: (operation: keyof PasswordConfig) => string;
  verifySecurityAnswer: (operation: keyof PasswordConfig, answer: string) => boolean;
  setSecurityQuestion: (operation: keyof PasswordConfig, answer: string) => void;
}

// Default passwords
const DEFAULT_PASSWORDS: PasswordConfig = {
  editMode: 'edit123',
  headerEdit: 'header123',
  export: 'admin123',
  columnManagement: 'column123',
  rowManagement: 'row123'
};

// Password hints
const PASSWORD_HINTS: Record<keyof PasswordConfig, string> = {
  editMode: 'Password for entering edit mode',
  headerEdit: 'Password for editing table headers',
  export: 'Password for exporting data',
  columnManagement: 'Password for managing columns',
  rowManagement: 'Password for managing rows'
};

// Security questions
const SECURITY_QUESTIONS: Record<keyof PasswordConfig, string> = {
  editMode: 'What is the name of your first pet?',
  headerEdit: 'What city were you born in?',
  export: 'What is your mother\'s maiden name?',
  columnManagement: 'What was your first car?',
  rowManagement: 'What is your favorite color?'
};

// Create context
const PasswordContext = createContext<PasswordContextType | undefined>(undefined);

// Password provider component
export const PasswordProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [passwords, setPasswords] = useState<PasswordConfig>(DEFAULT_PASSWORDS);
  const [securityAnswers, setSecurityAnswers] = useState<Record<keyof PasswordConfig, string>>({} as Record<keyof PasswordConfig, string>);
  const [passwordExpiry, setPasswordExpiry] = useState<Record<keyof PasswordConfig, number>>({} as Record<keyof PasswordConfig, number>);

  // Load passwords from localStorage on mount
  useEffect(() => {
    const savedPasswords = localStorage.getItem('leadPasswordConfig');
    const savedAnswers = localStorage.getItem('leadSecurityAnswers');
    const savedExpiry = localStorage.getItem('leadPasswordExpiry');

    if (savedPasswords) {
      try {
        const parsed = JSON.parse(savedPasswords);
        setPasswords({ ...DEFAULT_PASSWORDS, ...parsed });
      } catch (error) {
        console.error('Error loading password config:', error);
      }
    }

    if (savedAnswers) {
      try {
        setSecurityAnswers(JSON.parse(savedAnswers));
      } catch (error) {
        console.error('Error loading security answers:', error);
      }
    }

    if (savedExpiry) {
      try {
        setPasswordExpiry(JSON.parse(savedExpiry));
      } catch (error) {
        console.error('Error loading password expiry:', error);
      }
    }
  }, []);

  // Save passwords to localStorage
  const savePasswords = (newPasswords: PasswordConfig) => {
    localStorage.setItem('leadPasswordConfig', JSON.stringify(newPasswords));
    setPasswords(newPasswords);
  };

  // Save security answers to localStorage
  const saveSecurityAnswers = (newAnswers: Record<keyof PasswordConfig, string>) => {
    localStorage.setItem('leadSecurityAnswers', JSON.stringify(newAnswers));
    setSecurityAnswers(newAnswers);
  };

  // Save password expiry to localStorage
  const savePasswordExpiry = (newExpiry: Record<keyof PasswordConfig, number>) => {
    localStorage.setItem('leadPasswordExpiry', JSON.stringify(newExpiry));
    setPasswordExpiry(newExpiry);
  };

  // Verify password
  const verifyPassword = (operation: keyof PasswordConfig, password: string): boolean => {
    return passwords[operation] === password;
  };

  // Change password
  const changePassword = (operation: keyof PasswordConfig, newPassword: string): boolean => {
    if (newPassword.length < 6) {
      return false;
    }

    const newPasswords = { ...passwords, [operation]: newPassword };
    savePasswords(newPasswords);

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
  const resetPassword = (operation: keyof PasswordConfig): boolean => {
    const newPasswords = { ...passwords, [operation]: DEFAULT_PASSWORDS[operation] };
    savePasswords(newPasswords);
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
  const setSecurityQuestion = (operation: keyof PasswordConfig, answer: string): void => {
    const newAnswers = { ...securityAnswers, [operation]: answer };
    saveSecurityAnswers(newAnswers);
  };

  const contextValue: PasswordContextType = {
    verifyPassword,
    changePassword,
    getPasswordHint,
    getPasswordStrength,
    isPasswordExpired,
    resetPassword,
    getSecurityQuestion,
    verifySecurityAnswer,
    setSecurityQuestion
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
