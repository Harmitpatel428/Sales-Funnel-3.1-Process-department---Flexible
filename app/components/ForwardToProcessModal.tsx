'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Lead } from '../types/shared';

interface ContactPerson {
    name: string;
    designation: string;
    customDesignation: string;
    phoneNumber: string;
}

interface ForwardToProcessFormData {
    policyType: string;
    caseType: string;
    benefitTypes: string[];
    companyName: string;
    companyType: string;
    contacts: ContactPerson[];
    talukaCategory: string;
    termLoanAmount: string;
    plantMachineryValue: string;
    electricityLoad: string;
    electricityLoadType: 'HT' | 'LT' | '';
}

interface ForwardToProcessModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ForwardToProcessFormData) => void;
    lead: Lead;
}

// Default policy types - can be edited/deleted
const DEFAULT_POLICY_TYPES = [
    'MSME Policy 2022',
    'Industrial Policy 2020',
    'IT Policy 2019',
    'Tourism Policy 2021',
    'Export Policy 2023'
];

const CASE_TYPES = [
    'New',
    'Expansion',
    'Expansion at new location',
    'Shifting',
    'Load Enhance'
];

const BENEFIT_TYPES = [
    'Capital subsidy',
    'Interest Subsidy',
    'SGST Subsidy',
    'Power Connection charges',
    'Electricity Duty Exemption Subsidy'
];

const COMPANY_TYPES = [
    'Limited',
    'Pvt Limited',
    'Partnership',
    'LLP',
    'OPC',
    'Proprietory'
];

const DESIGNATIONS = [
    'Director',
    'Partner',
    'Owner',
    'CFO',
    'Manager',
    'CA',
    'Other'
];

const TALUKA_CATEGORIES = ['1', '2', '3'];

const STORAGE_KEY = 'forwardToProcess_policyTypes';
const BENEFITS_STORAGE_KEY = 'forwardToProcess_benefitTypes';

export default function ForwardToProcessModal({
    isOpen,
    onClose,
    onSubmit,
    lead
}: ForwardToProcessModalProps) {
    // Form state
    const [currentStep, setCurrentStep] = useState(1);
    const [showDraftSaved, setShowDraftSaved] = useState(false);
    const [formData, setFormData] = useState<ForwardToProcessFormData>({
        policyType: '',
        caseType: '',
        benefitTypes: [],
        companyName: '',
        companyType: '',
        contacts: [{ name: '', designation: '', customDesignation: '', phoneNumber: '' }],
        talukaCategory: '',
        termLoanAmount: '',
        plantMachineryValue: '',
        electricityLoad: '',
        electricityLoadType: ''
    });

    const draftKey = `forwardToProcess_draft_${lead.id}`;

    // Policy types management
    const [policyTypes, setPolicyTypes] = useState<string[]>([]);
    const [isAddingPolicy, setIsAddingPolicy] = useState(false);
    const [newPolicyType, setNewPolicyType] = useState('');
    const [editingPolicyIndex, setEditingPolicyIndex] = useState<number | null>(null);
    const [editingPolicyValue, setEditingPolicyValue] = useState('');

    const newPolicyInputRef = useRef<HTMLInputElement>(null);

    // Benefit types management
    const [benefitTypes, setBenefitTypes] = useState<string[]>([]);
    const [isAddingBenefit, setIsAddingBenefit] = useState(false);
    const [newBenefitType, setNewBenefitType] = useState('');
    const [editingBenefitIndex, setEditingBenefitIndex] = useState<number | null>(null);
    const [editingBenefitValue, setEditingBenefitValue] = useState('');

    const newBenefitInputRef = useRef<HTMLInputElement>(null);

    // Load policy types from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setPolicyTypes(JSON.parse(stored));
        } else {
            setPolicyTypes(DEFAULT_POLICY_TYPES);
        }

        // Load benefit types
        const storedBenefits = localStorage.getItem(BENEFITS_STORAGE_KEY);
        if (storedBenefits) {
            setBenefitTypes(JSON.parse(storedBenefits));
        } else {
            setBenefitTypes(BENEFIT_TYPES);
        }
    }, []);

    // Save policy types to localStorage
    useEffect(() => {
        if (policyTypes.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(policyTypes));
        }
    }, [policyTypes]);

    // Save benefit types to localStorage
    useEffect(() => {
        if (benefitTypes.length > 0) {
            localStorage.setItem(BENEFITS_STORAGE_KEY, JSON.stringify(benefitTypes));
        }
    }, [benefitTypes]);

    // Pre-fill company name and contacts from lead
    useEffect(() => {
        if (isOpen && lead) {
            // Check for saved draft first
            const savedDraft = localStorage.getItem(draftKey);

            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    // Merge with defaults to ensure new fields have valid values for old drafts
                    setFormData(prev => ({
                        ...prev,
                        ...parsed,
                        // Ensure new financial/location fields default to empty string if missing
                        talukaCategory: parsed.talukaCategory ?? '',
                        termLoanAmount: parsed.termLoanAmount ?? '',
                        plantMachineryValue: parsed.plantMachineryValue ?? '',
                        electricityLoad: parsed.electricityLoad ?? '',
                        electricityLoadType: parsed.electricityLoadType ?? ''
                    }));
                    return; // Stop if draft loaded
                } catch (e) {
                    console.error("Error loading draft", e);
                }
            }
            const leadAny = lead as any;
            const companyName = lead.company || leadAny.companyName || leadAny.company_name || leadAny.Company || leadAny.clientName || '';

            // Map mobile numbers to contacts
            let initialContacts: ContactPerson[] = [];

            if (lead.mobileNumbers && lead.mobileNumbers.length > 0) {
                initialContacts = lead.mobileNumbers.map(m => ({
                    name: m.name || lead.clientName || '',
                    designation: '',
                    customDesignation: '',
                    phoneNumber: m.number || ''
                }));
            } else {
                // Fallback if no mobile numbers array
                const phoneNumber = lead.mobileNumber || leadAny.phoneNumber || leadAny.phone || '';
                initialContacts = [{
                    name: lead.clientName || leadAny.contactName || '',
                    designation: '',
                    customDesignation: '',
                    phoneNumber: phoneNumber
                }];
            }

            // Ensure at least one empty contact if everything fails
            if (initialContacts.length === 0) {
                initialContacts = [{ name: '', designation: '', customDesignation: '', phoneNumber: '' }];
            }

            setFormData(prev => ({
                ...prev,
                companyName: capitalizeFirstLetter(companyName),
                contacts: initialContacts
            }));
        }
    }, [isOpen, lead, draftKey]);

    // Focus new inputs
    useEffect(() => {
        if (isAddingPolicy && newPolicyInputRef.current) {
            newPolicyInputRef.current.focus();
        }
        if (isAddingBenefit && newBenefitInputRef.current) {
            newBenefitInputRef.current.focus();
        }
    }, [isAddingPolicy, isAddingBenefit]);

    // ESC key handler
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Helper functions
    const capitalizeFirstLetter = (str: string) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const getPhoneFromLead = (lead: Lead): string => {
        if (lead.mobileNumbers && lead.mobileNumbers.length > 0) {
            const main = lead.mobileNumbers.find(m => m.isMain);
            return main?.number || lead.mobileNumbers[0]?.number || '';
        }
        const leadAny = lead as any;
        return leadAny.mobileNumber || leadAny.phoneNumber || leadAny.phone || '';
    };

    // Policy management handlers
    const handleAddPolicy = () => {
        if (newPolicyType.trim()) {
            setPolicyTypes(prev => [...prev, newPolicyType.trim()]);
            setNewPolicyType('');
            setIsAddingPolicy(false);
        }
    };

    const handleEditPolicy = (index: number) => {
        setEditingPolicyIndex(index);
        setEditingPolicyValue(policyTypes[index]);
    };

    const handleSaveEditPolicy = () => {
        if (editingPolicyIndex !== null && editingPolicyValue.trim()) {
            setPolicyTypes(prev => {
                const updated = [...prev];
                updated[editingPolicyIndex] = editingPolicyValue.trim();
                return updated;
            });
            setEditingPolicyIndex(null);
            setEditingPolicyValue('');
        }
    };

    const handleDeletePolicy = (index: number) => {
        setPolicyTypes(prev => prev.filter((_, i) => i !== index));
        if (formData.policyType === policyTypes[index]) {
            setFormData(prev => ({ ...prev, policyType: '' }));
        }
    };

    // Benefit management handlers
    const handleAddBenefit = () => {
        if (newBenefitType.trim()) {
            setBenefitTypes(prev => [...prev, newBenefitType.trim()]);
            setNewBenefitType('');
            setIsAddingBenefit(false);
        }
    };

    const handleEditBenefit = (index: number) => {
        setEditingBenefitIndex(index);
        setEditingBenefitValue(benefitTypes[index]);
    };

    const handleSaveEditBenefit = () => {
        if (editingBenefitIndex !== null && editingBenefitValue.trim()) {
            const oldValue = benefitTypes[editingBenefitIndex];
            const newValue = editingBenefitValue.trim();

            setBenefitTypes(prev => {
                const updated = [...prev];
                updated[editingBenefitIndex] = newValue;
                return updated;
            });

            // Update selected benefits if the renamed benefit was selected
            if (formData.benefitTypes.includes(oldValue)) {
                setFormData(prev => ({
                    ...prev,
                    benefitTypes: prev.benefitTypes.map(b => b === oldValue ? newValue : b)
                }));
            }

            setEditingBenefitIndex(null);
            setEditingBenefitValue('');
        }
    };

    const handleDeleteBenefit = (index: number) => {
        const benefitToDelete = benefitTypes[index];
        setBenefitTypes(prev => prev.filter((_, i) => i !== index));

        // Remove from selected benefits if strictly present
        if (formData.benefitTypes.includes(benefitToDelete)) {
            setFormData(prev => ({
                ...prev,
                benefitTypes: prev.benefitTypes.filter(b => b !== benefitToDelete)
            }));
        }
    };

    // Form handlers
    const handleBenefitToggle = (benefit: string) => {
        setFormData(prev => ({
            ...prev,
            benefitTypes: prev.benefitTypes.includes(benefit)
                ? prev.benefitTypes.filter(b => b !== benefit)
                : [...prev.benefitTypes, benefit]
        }));
    };

    const handleCompanyNameChange = (value: string) => {
        setFormData(prev => ({
            ...prev,
            companyName: capitalizeFirstLetter(value)
        }));
    };

    const handleContactChange = (index: number, field: keyof ContactPerson, value: string) => {
        setFormData(prev => {
            const updatedContacts = [...prev.contacts];
            updatedContacts[index] = { ...updatedContacts[index], [field]: value };
            return { ...prev, contacts: updatedContacts };
        });
    };

    const handleAddContact = () => {
        setFormData(prev => ({
            ...prev,
            contacts: [...prev.contacts, { name: '', designation: '', customDesignation: '', phoneNumber: '' }]
        }));
    };

    const handleRemoveContact = (index: number) => {
        if (formData.contacts.length > 1) {
            setFormData(prev => ({
                ...prev,
                contacts: prev.contacts.filter((_, i) => i !== index)
            }));
        }
    };

    const isFormValid = Boolean(formData.policyType && formData.caseType && formData.companyName && formData.companyType && formData.benefitTypes.length > 0);

    const handleSaveDraft = () => {
        localStorage.setItem(draftKey, JSON.stringify(formData));
        setShowDraftSaved(true);
        setTimeout(() => setShowDraftSaved(false), 3000);
    };

    const handleNextPage = () => {
        if (isFormValid) {
            setCurrentStep(2);
        }
    };

    const handleBack = () => {
        setCurrentStep(1);
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        localStorage.removeItem(draftKey);
        onSubmit(formData);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] overflow-hidden" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-purple-900/90 to-slate-900/95 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Full Screen Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                        className="relative h-full w-full flex flex-col"
                    >
                        {/* Form Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto bg-gray-50">
                            {/* Minimal Top Bar */}
                            <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-600">
                                    {currentStep === 1 ? 'Step 1: Fill Details' : 'Step 2: Review & Submit'}
                                </span>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-all"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <form onSubmit={(e) => e.preventDefault()} className="max-w-[1800px] mx-auto px-4 py-3">
                                {currentStep === 1 ? (
                                    <>
                                        {/* Section 1: Case Information */}
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-3">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="p-1.5 bg-purple-100 rounded-lg">
                                                    <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                                    </svg>
                                                </div>
                                                <h2 className="text-base font-semibold text-gray-900">Case Information</h2>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {/* Policy Type */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Policy Type <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        value={formData.policyType}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, policyType: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                    >
                                                        <option value="">Select Policy Type</option>
                                                        {policyTypes.map((type, idx) => (
                                                            <option key={idx} value={type}>{type}</option>
                                                        ))}
                                                    </select>

                                                    {/* Policy Tags */}
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {policyTypes.slice(0, 3).map((type, idx) => (
                                                            <div key={idx} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                                                {editingPolicyIndex === idx ? (
                                                                    <>
                                                                        <input
                                                                            type="text"
                                                                            value={editingPolicyValue}
                                                                            onChange={(e) => setEditingPolicyValue(e.target.value)}
                                                                            className="px-1 py-0.5 border rounded text-xs w-24 text-gray-900 placeholder:text-gray-900"
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEditPolicy()}
                                                                        />
                                                                        <button type="button" onClick={handleSaveEditPolicy} className="text-green-600">✓</button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-gray-600">{type}</span>
                                                                        <button type="button" onClick={() => handleEditPolicy(idx)} className="text-blue-500 hover:text-blue-600 ml-1">
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.5H9v-3.5z" />
                                                                            </svg>
                                                                        </button>
                                                                        <button type="button" onClick={() => handleDeletePolicy(idx)} className="text-red-500 hover:text-red-600">×</button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {isAddingPolicy ? (
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    ref={newPolicyInputRef}
                                                                    type="text"
                                                                    value={newPolicyType}
                                                                    onChange={(e) => setNewPolicyType(e.target.value)}
                                                                    placeholder="New..."
                                                                    className="px-2 py-1 border rounded text-xs w-20 text-gray-900 placeholder:text-gray-900"
                                                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPolicy())}
                                                                />
                                                                <button type="button" onClick={handleAddPolicy} className="text-green-600 text-xs">✓</button>
                                                                <button type="button" onClick={() => setIsAddingPolicy(false)} className="text-red-500 text-xs">×</button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsAddingPolicy(true)}
                                                                className="text-purple-600 hover:text-purple-700 text-xs font-medium flex items-center gap-0.5"
                                                            >
                                                                <span>+</span> Add
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Case Type */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Case Type <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        value={formData.caseType}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, caseType: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                    >
                                                        <option value="">Select Case Type</option>
                                                        {CASE_TYPES.map(type => (
                                                            <option key={type} value={type}>{type}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Benefit Types */}
                                                <div className="md:col-span-2 lg:col-span-1">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="block text-sm font-medium text-gray-700">
                                                            Benefit Types
                                                        </label>
                                                        {!isAddingBenefit && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsAddingBenefit(true)}
                                                                className="text-purple-600 hover:text-purple-700 text-xs font-medium flex items-center gap-1"
                                                            >
                                                                <span>+</span> Add Custom
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Add New Benefit Input */}
                                                    {isAddingBenefit && (
                                                        <div className="flex items-center gap-2 mb-3 bg-gray-50 p-2 rounded-lg border border-purple-200">
                                                            <input
                                                                ref={newBenefitInputRef}
                                                                type="text"
                                                                value={newBenefitType}
                                                                onChange={(e) => setNewBenefitType(e.target.value)}
                                                                placeholder="Enter benefit name..."
                                                                className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-500"
                                                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBenefit())}
                                                            />
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleAddBenefit}
                                                                    className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                                                    title="Add"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsAddingBenefit(false)}
                                                                    className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                                                    title="Cancel"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-1">
                                                        {benefitTypes.map((benefit, idx) => (
                                                            <div
                                                                key={idx}
                                                                className={`group flex items-center justify-between p-2 rounded-lg border transition-all ${formData.benefitTypes.includes(benefit)
                                                                    ? 'bg-purple-50 border-purple-200'
                                                                    : 'bg-white border-gray-200 hover:border-purple-200'
                                                                    }`}
                                                            >
                                                                {editingBenefitIndex === idx ? (
                                                                    <div className="flex items-center gap-2 w-full">
                                                                        <input
                                                                            type="text"
                                                                            value={editingBenefitValue}
                                                                            onChange={(e) => setEditingBenefitValue(e.target.value)}
                                                                            className="flex-1 px-2 py-1 border rounded text-sm text-gray-900"
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEditBenefit()}
                                                                            autoFocus
                                                                        />
                                                                        <button type="button" onClick={handleSaveEditBenefit} className="text-green-600 hover:text-green-700 p-1">
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={formData.benefitTypes.includes(benefit)}
                                                                                onChange={() => handleBenefitToggle(benefit)}
                                                                                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                                            />
                                                                            <span className={`text-sm ${formData.benefitTypes.includes(benefit) ? 'text-purple-900 font-medium' : 'text-gray-700'}`}>
                                                                                {benefit}
                                                                            </span>
                                                                        </label>

                                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleEditBenefit(idx)}
                                                                                className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                                                title="Edit"
                                                                            >
                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.5H9v-3.5z" />
                                                                                </svg>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteBenefit(idx)}
                                                                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                                                title="Delete"
                                                                            >
                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                                </svg>
                                                                            </button>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {formData.benefitTypes.length === 0 && (
                                                        <p className="text-xs text-red-500 mt-2">
                                                            Please select at least one benefit type
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section 2: Company Details */}
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-3">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="p-1.5 bg-blue-100 rounded-lg">
                                                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                    </svg>
                                                </div>
                                                <h2 className="text-base font-semibold text-gray-900">Company Details</h2>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {/* Company Name */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Company Name <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={formData.companyName}
                                                        onChange={(e) => handleCompanyNameChange(e.target.value)}
                                                        placeholder="Enter company name"
                                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                    />
                                                </div>

                                                {/* Company Type */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Company Type <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        value={formData.companyType}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, companyType: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                    >
                                                        <option value="">Select Company Type</option>
                                                        {COMPANY_TYPES.map(type => (
                                                            <option key={type} value={type}>{type}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section 3: Financial & Location Details */}
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="p-1.5 bg-emerald-100 rounded-lg">
                                                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <h2 className="text-base font-semibold text-gray-900">Financial & Location Details</h2>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {/* Taluka Category */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Taluka Category
                                                    </label>
                                                    <select
                                                        value={formData.talukaCategory}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, talukaCategory: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                    >
                                                        <option value="">Select</option>
                                                        {TALUKA_CATEGORIES.map(cat => (
                                                            <option key={cat} value={cat}>Category {cat}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Term Loan Amount */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Term Loan Amount
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                                        <input
                                                            type="text"
                                                            value={formData.termLoanAmount}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, termLoanAmount: e.target.value }))}
                                                            placeholder="Amount"
                                                            className="w-full pl-6 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Plant & Machinery Value */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Plant & Machinery
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                                        <input
                                                            type="text"
                                                            value={formData.plantMachineryValue}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, plantMachineryValue: e.target.value }))}
                                                            placeholder="Value"
                                                            className="w-full pl-6 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Electricity Load */}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Electricity Load
                                                    </label>
                                                    <div className="flex gap-1.5">
                                                        <input
                                                            type="text"
                                                            value={formData.electricityLoad}
                                                            onChange={(e) => {
                                                                const value = e.target.value.replace(/[^0-9.]/g, '');
                                                                setFormData(prev => ({ ...prev, electricityLoad: value }));
                                                            }}
                                                            placeholder="Load"
                                                            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white transition-all"
                                                        />
                                                        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(prev => ({ ...prev, electricityLoadType: 'HT' }))}
                                                                className={`px-2.5 py-1.5 text-xs font-semibold transition-all ${formData.electricityLoadType === 'HT'
                                                                    ? 'bg-purple-600 text-white'
                                                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                                                                    }`}
                                                            >
                                                                HT
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(prev => ({ ...prev, electricityLoadType: 'LT' }))}
                                                                className={`px-2.5 py-1.5 text-xs font-semibold transition-all border-l border-gray-300 ${formData.electricityLoadType === 'LT'
                                                                    ? 'bg-purple-600 text-white'
                                                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                                                                    }`}
                                                            >
                                                                LT
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section 4: Contact Persons */}
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-3">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-green-100 rounded-lg">
                                                        <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                        </svg>
                                                    </div>
                                                    <h2 className="text-base font-semibold text-gray-900">Contact Persons</h2>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleAddContact}
                                                    className="flex items-center gap-1 px-2 py-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-all font-medium text-xs"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    Add
                                                </button>
                                            </div>

                                            <div className="space-y-2">
                                                {formData.contacts.map((contact, idx) => (
                                                    <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                                                <span className="w-5 h-5 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                                                            </span>
                                                            {formData.contacts.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveContact(idx)}
                                                                    className="text-red-500 hover:text-red-600 p-1 rounded transition-all"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                            <input
                                                                type="text"
                                                                value={contact.name}
                                                                onChange={(e) => handleContactChange(idx, 'name', e.target.value)}
                                                                placeholder="Name"
                                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white"
                                                            />
                                                            <input
                                                                type="tel"
                                                                value={contact.phoneNumber}
                                                                onChange={(e) => handleContactChange(idx, 'phoneNumber', e.target.value)}
                                                                placeholder="Phone"
                                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white"
                                                            />
                                                            <select
                                                                value={contact.designation}
                                                                onChange={(e) => handleContactChange(idx, 'designation', e.target.value)}
                                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white"
                                                            >
                                                                <option value="">Designation</option>
                                                                {DESIGNATIONS.map(d => (
                                                                    <option key={d} value={d}>{d}</option>
                                                                ))}
                                                            </select>
                                                            {contact.designation === 'Other' && (
                                                                <input
                                                                    type="text"
                                                                    value={contact.customDesignation}
                                                                    onChange={(e) => handleContactChange(idx, 'customDesignation', e.target.value)}
                                                                    placeholder="Custom"
                                                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                    </>) : (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-3">
                                        <div className="flex items-center gap-2 mb-4 border-b pb-2">
                                            <div className="p-1.5 bg-purple-100 rounded-lg">
                                                <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <h2 className="text-base font-semibold text-gray-900">Review & Confirm</h2>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                            <div>
                                                <dt className="text-xs font-medium text-gray-500">Policy Type</dt>
                                                <dd className="mt-0.5 font-medium text-gray-900">{formData.policyType}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs font-medium text-gray-500">Case Type</dt>
                                                <dd className="mt-0.5 font-medium text-gray-900">{formData.caseType}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs font-medium text-gray-500">Company</dt>
                                                <dd className="mt-0.5 font-medium text-gray-900">{formData.companyName}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs font-medium text-gray-500">Company Type</dt>
                                                <dd className="mt-0.5 font-medium text-gray-900">{formData.companyType}</dd>
                                            </div>

                                            {/* Benefit Types */}
                                            <div className="md:col-span-4 mt-2">
                                                <dt className="text-xs font-medium text-gray-500 mb-1">Benefits</dt>
                                                <dd className="flex flex-wrap gap-1">
                                                    {formData.benefitTypes.map((b, i) => (
                                                        <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{b}</span>
                                                    ))}
                                                    {formData.benefitTypes.length === 0 && <span className="text-gray-400 italic text-xs">None</span>}
                                                </dd>
                                            </div>

                                            {/* Financial Details */}
                                            <div className="md:col-span-4 border-t pt-3 mt-2">
                                                <h3 className="text-xs font-semibold text-gray-700 mb-2">Financial & Location</h3>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div>
                                                        <dt className="text-xs text-gray-500">Taluka</dt>
                                                        <dd className="text-sm font-medium text-gray-900">
                                                            {formData.talukaCategory ? `Category ${formData.talukaCategory}` : <span className="text-gray-400">-</span>}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-xs text-gray-500">Term Loan</dt>
                                                        <dd className="text-sm font-medium text-gray-900">
                                                            {formData.termLoanAmount ? `₹${formData.termLoanAmount}` : <span className="text-gray-400">-</span>}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-xs text-gray-500">Plant & Mach.</dt>
                                                        <dd className="text-sm font-medium text-gray-900">
                                                            {formData.plantMachineryValue ? `₹${formData.plantMachineryValue}` : <span className="text-gray-400">-</span>}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-xs text-gray-500">Elec. Load</dt>
                                                        <dd className="text-sm font-medium text-gray-900">
                                                            {formData.electricityLoad ? (
                                                                <span>
                                                                    {formData.electricityLoad}
                                                                    {formData.electricityLoadType && (
                                                                        <span className={`ml-1 px-1.5 py-0.5 text-xs font-semibold rounded ${formData.electricityLoadType === 'HT'
                                                                            ? 'bg-orange-100 text-orange-700'
                                                                            : 'bg-blue-100 text-blue-700'
                                                                            }`}>
                                                                            {formData.electricityLoadType}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ) : <span className="text-gray-400">-</span>}
                                                        </dd>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Contacts */}
                                            <div className="md:col-span-4 border-t pt-3 mt-2">
                                                <h3 className="text-xs font-semibold text-gray-700 mb-2">Contacts</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {formData.contacts.map((contact, i) => (
                                                        <div key={i} className="flex items-center gap-4 px-5 py-4 bg-gray-50 rounded-xl border border-gray-200">
                                                            <span className="w-10 h-10 flex items-center justify-center bg-purple-600 text-white rounded-full text-base font-bold">{i + 1}</span>
                                                            <div>
                                                                <div className="font-bold text-gray-900 text-lg">{contact.name}</div>
                                                                <div className="text-base text-gray-500">{contact.designation === 'Other' ? contact.customDesignation : contact.designation} • {contact.phoneNumber}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Footer Actions */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sticky bottom-0 z-10">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {currentStep === 1 && (
                                                <p className="text-xs text-gray-500">
                                                    <span className="text-red-500">*</span> Required
                                                </p>
                                            )}
                                            {showDraftSaved && (
                                                <span className="text-green-600 text-xs font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg border border-green-100">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Saved
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {currentStep === 1 ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={onClose}
                                                        className="px-3 py-1.5 text-sm text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveDraft}
                                                        className="px-3 py-1.5 text-sm text-purple-700 font-medium bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors flex items-center gap-1"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                                        </svg>
                                                        Draft
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={!isFormValid}
                                                        onClick={handleNextPage}
                                                        className="px-4 py-1.5 text-sm text-white font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-md shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-1"
                                                    >
                                                        Next
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                        </svg>
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={handleBack}
                                                        className="px-3 py-1.5 text-sm text-gray-700 font-medium bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-1"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                                        </svg>
                                                        Back
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleSubmit(e)}
                                                        className="px-4 py-1.5 text-sm text-white font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-md shadow-purple-500/25 transition-all flex items-center gap-1"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Submit
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
