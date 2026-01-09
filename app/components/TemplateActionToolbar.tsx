'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, MessageCircle, ChevronDown } from 'lucide-react';
import {
  openWhatsApp,
  getMainPhoneNumber,
  sanitizeContent,
  hasValidContent,
  type WhatsAppOptions
} from '../utils/whatsappUtils';

interface Lead {
  id: string;
  mobileNumber?: string;
  mobileNumbers?: Array<{
    number: string;
    isMain?: boolean;
  }>;
}

interface TemplateActionToolbarProps {
  templateContent: string;
  lead?: Lead | null;
  onCopy?: () => void;
  className?: string;
}

const TemplateActionToolbar = React.memo<TemplateActionToolbarProps>(function TemplateActionToolbar({
  templateContent,
  lead,
  onCopy,
  className = ''
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [showWhatsAppDropdown, setShowWhatsAppDropdown] = useState(false);
  const [showNumberInput, setShowNumberInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Calculate dropdown position
  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
  };

  // Close dropdown when clicking outside and handle positioning
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setShowWhatsAppDropdown(false);
        setShowNumberInput(false);
        setPhoneNumber('');
        setPhoneError('');
      }
    };

    const handleScroll = () => {
      if (showWhatsAppDropdown) {
        updateDropdownPosition();
      }
    };

    if (showWhatsAppDropdown) {
      updateDropdownPosition();
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', updateDropdownPosition);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [showWhatsAppDropdown]);

  const handleCopy = async () => {
    try {
      const plainText = sanitizeContent(templateContent);
      await navigator.clipboard.writeText(plainText);
      setCopySuccess(true);
      onCopy?.();

      // Clear success message after 2 seconds
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const handleWhatsAppSend = async (phoneNumber: string) => {
    if (isLoading) return; // Prevent multiple clicks

    setIsLoading(true);
    setPhoneError('');

    try {
      const plainText = sanitizeContent(templateContent);

      const options: WhatsAppOptions = {
        phoneNumber,
        message: plainText,
        fallbackToWeb: true,
        timeout: 2000
      };

      const result = await openWhatsApp(options);

      if (result.success) {
        // Close dropdown after successful send
        setShowWhatsAppDropdown(false);
        setShowNumberInput(false);
        setPhoneNumber('');
      } else {
        setPhoneError(result.error || 'Failed to open WhatsApp');
      }
    } catch (error) {
      setPhoneError('An unexpected error occurred');
      console.error('WhatsApp send error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWhatsAppOption = async (option: 'main' | 'new') => {
    if (option === 'main') {
      const mainNumber = getMainPhoneNumber(lead);
      if (mainNumber) {
        await handleWhatsAppSend(mainNumber);
      } else {
        setPhoneError('No phone number available for this lead');
      }
    } else if (option === 'new') {
      setShowNumberInput(true);
    }
  };

  const handleNumberSubmit = async () => {
    if (phoneNumber.trim()) {
      await handleWhatsAppSend(phoneNumber);
    }
  };

  const handlePhoneNumberChange = (value: string) => {
    setPhoneNumber(value);
    setPhoneError('');
  };

  const mainNumber = getMainPhoneNumber(lead);
  const hasMainNumber = Boolean(mainNumber);

  // Only render toolbar if template has valid content
  if (!hasValidContent(templateContent)) {
    return null;
  }

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Copy Button */}
        <div className="relative">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors flex items-center gap-1"
            title="Copy template content"
          >
            <Copy className="h-3 w-3" />
            Copy
          </button>
          {copySuccess && (
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-green-600 text-white text-xs rounded whitespace-nowrap">
              Copied!
            </div>
          )}
        </div>

        {/* WhatsApp Button */}
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setShowWhatsAppDropdown(!showWhatsAppDropdown)}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send via WhatsApp"
            data-testid="whatsapp-button"
          >
            <MessageCircle className="h-3 w-3" />
            {isLoading ? 'Opening...' : 'WhatsApp'}
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* WhatsApp Dropdown - Rendered via Portal */}
      {showWhatsAppDropdown && typeof window !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-48 bg-white border border-gray-200 rounded-md shadow-lg z-[70]"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`
          }}
          data-testid="whatsapp-dropdown"
        >
          {!showNumberInput ? (
            <>
              <button
                type="button"
                onClick={() => handleWhatsAppOption('main')}
                disabled={!hasMainNumber || isLoading}
                className={`w-full px-4 py-2 text-sm text-left rounded-t-md ${hasMainNumber && !isLoading
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-400 cursor-not-allowed'
                  }`}
                title={hasMainNumber ? `Send to main number: ${mainNumber}` : 'No lead selected'}
              >
                Main Number
                {hasMainNumber && (
                  <span className="block text-xs text-gray-500 mt-1">
                    {mainNumber}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleWhatsAppOption('new')}
                disabled={isLoading}
                className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 border-t border-gray-100 rounded-b-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                New Number
              </button>
            </>
          ) : (
            <div className="p-4">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => handlePhoneNumberChange(e.target.value)}
                  placeholder="Enter 10-digit number"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder:text-gray-500"
                  maxLength={10}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleNumberSubmit();
                    } else if (e.key === 'Escape') {
                      setShowNumberInput(false);
                      setPhoneNumber('');
                      setPhoneError('');
                    }
                  }}
                  autoFocus
                />
                {phoneError && (
                  <p className="text-xs text-red-600">{phoneError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNumberInput(false);
                      setPhoneNumber('');
                      setPhoneError('');
                    }}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleNumberSubmit}
                    disabled={!phoneNumber.trim() || isLoading}
                    className="px-3 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
});

TemplateActionToolbar.displayName = 'TemplateActionToolbar';

export default TemplateActionToolbar;