'use client';

import React, { useState, useEffect } from 'react';
import type { Lead, MobileNumber } from '../types/shared';
import { validateMobileNumber } from '../hooks/useValidation';

interface MobileNumbersModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onSave: (updatedLead: Lead) => void;
}

const MobileNumbersModal = React.memo<MobileNumbersModalProps>(function MobileNumbersModal({
  isOpen,
  onClose,
  lead,
  onSave
}) {
  const [mobileNumbers, setMobileNumbers] = useState<MobileNumber[]>([
    { id: '1', number: '', name: '', isMain: true },
    { id: '2', number: '', name: '', isMain: false },
    { id: '3', number: '', name: '', isMain: false }
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize mobile numbers from lead data
  useEffect(() => {
    if (lead.mobileNumbers && Array.isArray(lead.mobileNumbers)) {
      const initializedNumbers = [
        { id: '1', number: '', name: '', isMain: true },
        { id: '2', number: '', name: '', isMain: false },
        { id: '3', number: '', name: '', isMain: false }
      ];

      lead.mobileNumbers.forEach((mobile, index) => {
        if (index < 3) {
          initializedNumbers[index] = {
            id: mobile.id || String(index + 1),
            number: mobile.number || '',
            name: mobile.name || '',
            isMain: mobile.isMain || false
          };
        }
      });

      setMobileNumbers(initializedNumbers);
    } else if (lead.mobileNumber) {
      // Convert old format to new format
      const initializedNumbers = [
        { id: '1', number: lead.mobileNumber, name: lead.clientName || '', isMain: true },
        { id: '2', number: '', name: '', isMain: false },
        { id: '3', number: '', name: '', isMain: false }
      ];
      setMobileNumbers(initializedNumbers);
    }
  }, [lead]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleMobileNumberChange = (index: number, value: string) => {
    // Only allow numeric characters (0-9) and limit to 10 digits
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 10);

    setMobileNumbers(prev =>
      prev.map((mobile, i) =>
        i === index ? { ...mobile, number: numericValue } : mobile
      )
    );

    // Clear error for this field
    const errorKey = `mobileNumber_${index}`;
    if (errors[errorKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  const handleMobileNameChange = (index: number, value: string) => {
    setMobileNumbers(prev =>
      prev.map((mobile, i) =>
        i === index ? { ...mobile, name: value } : mobile
      )
    );
  };

  const handleMainMobileNumberChange = (index: number) => {
    setMobileNumbers(prev =>
      prev.map((mobile, i) => ({
        ...mobile,
        isMain: i === index
      }))
    );
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    mobileNumbers.forEach((mobile, index) => {
      if (mobile.number.trim()) {
        const error = validateMobileNumber(mobile.number);
        if (error) {
          newErrors[`mobileNumber_${index}`] = error;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Get main mobile number for backward compatibility
      const mainMobileNumber = mobileNumbers.find(mobile => mobile.isMain)?.number || mobileNumbers[0]?.number || '';

      const updatedLead: Lead = {
        ...lead,
        mobileNumbers: mobileNumbers,
        mobileNumber: mainMobileNumber // Keep for backward compatibility
      };

      await onSave(updatedLead);
      onClose();
    } catch (error) {
      console.error('Error saving mobile numbers:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-5 mx-auto p-4 border w-11/12 md:w-2/3 lg:w-1/2 shadow-lg rounded-md bg-white">
        {/* Modal Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-black">Edit Mobile Numbers</h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-black transition-colors"
            title="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-sm font-medium text-black mb-2">Lead Information</div>
            <div className="text-sm text-black">{lead.kva} - {lead.clientName}</div>
            <div className="text-xs text-gray-600">{lead.company}</div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-black">Mobile Numbers</label>
            {mobileNumbers.map((mobile, index) => (
              <div key={mobile.id} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={mobile.name}
                      onChange={(e) => handleMobileNameChange(index, e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black placeholder:text-black"
                      placeholder={`Contact ${index + 1}`}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={mobile.number}
                      onChange={(e) => handleMobileNumberChange(index, e.target.value)}
                      className={`w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black ${errors[`mobileNumber_${index}`] ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                      placeholder={`Mobile ${index + 1}`}
                      disabled={isSubmitting}
                      pattern="[0-9]*"
                      inputMode="numeric"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMainMobileNumberChange(index)}
                    disabled={isSubmitting}
                    className={`flex items-center space-x-1 px-2 py-1 text-xs rounded border transition-all duration-200 ${mobile.isMain
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-25'
                      }`}
                  >
                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${mobile.isMain ? 'border-purple-500 bg-purple-500' : 'border-gray-400'
                      }`}>
                      {mobile.isMain && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                      )}
                    </div>
                    <span className="font-medium">Main</span>
                  </button>
                </div>
                {errors[`mobileNumber_${index}`] && (
                  <p className="text-xs text-red-600 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors[`mobileNumber_${index}`]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex items-center space-x-2 text-blue-800 text-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Tip:</span>
              <span>Select "Main" to set the primary contact number for this lead.</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 rounded text-black font-medium hover:bg-gray-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 text-sm ${isSubmitting
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              }`}
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

MobileNumbersModal.displayName = 'MobileNumbersModal';

export default MobileNumbersModal;
