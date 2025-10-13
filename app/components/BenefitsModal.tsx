'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Search } from 'lucide-react';
import { 
  getTalukasByDistrict, 
  getCategoryByTaluka,
  searchDistricts,
  type TalukaInfo 
} from '../constants/districtTalukaData';

interface BenefitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryResolved: (district: string, taluka: string, category: 'I' | 'II' | 'III') => void;
}

interface DropdownProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder,
  searchTerm,
  onSearchChange,
  isOpen,
  onToggle,
  onClose
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleOptionClick = (option: string) => {
    onChange(option);
    onClose();
    onSearchChange('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
      >
        <span className={value ? 'text-gray-900' : 'text-black'}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Search ${placeholder.toLowerCase()}...`}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder:text-black"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options found</div>
            ) : (
              options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleOptionClick(option)}
                  className="w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                  title={`Select ${option}`}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TalukaDropdown: React.FC<{
  talukas: TalukaInfo[];
  value: string;
  onChange: (value: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}> = ({
  talukas,
  value,
  onChange,
  searchTerm,
  onSearchChange,
  isOpen,
  onToggle,
  onClose
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleOptionClick = (taluka: TalukaInfo) => {
    onChange(taluka.name);
    onClose();
    onSearchChange('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  const filteredTalukas = searchTerm.trim()
    ? talukas.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : talukas;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
      >
        <span className={value ? 'text-gray-900' : 'text-black'}>
          {value || 'Select Taluka'}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search talukas..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder:text-black"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredTalukas.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No talukas found</div>
            ) : (
              filteredTalukas.map((taluka) => (
                <button
                  key={taluka.name}
                  type="button"
                  onClick={() => handleOptionClick(taluka)}
                  className="w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center justify-between"
                  title={`Select ${taluka.name} (Category ${taluka.category})`}
                >
                  <span>{taluka.name}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    taluka.category === 'I' ? 'bg-green-100 text-green-800' :
                    taluka.category === 'II' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    Category {taluka.category}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const BenefitsModal: React.FC<BenefitsModalProps> = ({
  isOpen,
  onClose,
  onCategoryResolved
}) => {
  const [selectedDistrict, setSelectedDistrict] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastDistrict') || '';
    }
    return '';
  });
  const [selectedTaluka, setSelectedTaluka] = useState<string>('');
  const [districtSearchTerm, setDistrictSearchTerm] = useState<string>('');
  const [talukaSearchTerm, setTalukaSearchTerm] = useState<string>('');
  const [isDistrictDropdownOpen, setIsDistrictDropdownOpen] = useState<boolean>(false);
  const [isTalukaDropdownOpen, setIsTalukaDropdownOpen] = useState<boolean>(false);
  const [resolvedCategory, setResolvedCategory] = useState<'I' | 'II' | 'III' | null>(null);

  // Rehydrate from localStorage on open
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const last = localStorage.getItem('lastDistrict');
      if (last) setSelectedDistrict(prev => prev || last);
    }
  }, [isOpen]);

  // Pre-open Taluka dropdown if persisted district exists
  useEffect(() => {
    if (selectedDistrict && isOpen) {
      setIsTalukaDropdownOpen(true);
    }
  }, [selectedDistrict, isOpen]);

  const districts = searchDistricts(districtSearchTerm);
  const talukas = selectedDistrict ? getTalukasByDistrict(selectedDistrict) : [];

  useEffect(() => {
    if (selectedTaluka && selectedDistrict) {
      const category = getCategoryByTaluka(selectedDistrict, selectedTaluka);
      setResolvedCategory(category);
    } else {
      setResolvedCategory(null);
    }
  }, [selectedDistrict, selectedTaluka]);

  const handleDistrictSelect = (district: string) => {
    setSelectedDistrict(district);
    setSelectedTaluka('');
    setTalukaSearchTerm('');
    setResolvedCategory(null);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastDistrict', district);
    }
  };

  const handleTalukaSelect = (taluka: string) => {
    setSelectedTaluka(taluka);
  };

  const handleConfirm = () => {
    if (selectedDistrict && selectedTaluka && resolvedCategory) {
      onCategoryResolved(selectedDistrict, selectedTaluka, resolvedCategory);
      handleClose();
    }
  };

  const handleClose = () => {
    setSelectedTaluka('');
    setDistrictSearchTerm('');
    setTalukaSearchTerm('');
    setIsDistrictDropdownOpen(false);
    setIsTalukaDropdownOpen(false);
    setResolvedCategory(null);
    onClose();
  };

  const handleReset = () => {
    setSelectedDistrict('');
    setSelectedTaluka('');
    setDistrictSearchTerm('');
    setTalukaSearchTerm('');
    setIsDistrictDropdownOpen(false);
    setIsTalukaDropdownOpen(false);
    setResolvedCategory(null);
    
    // Clear from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lastDistrict');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Select Benefits Category</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Close modal"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              District
            </label>
            <Dropdown
              options={districts}
              value={selectedDistrict}
              onChange={handleDistrictSelect}
              placeholder="Select District"
              searchTerm={districtSearchTerm}
              onSearchChange={setDistrictSearchTerm}
              isOpen={isDistrictDropdownOpen}
              onToggle={() => setIsDistrictDropdownOpen(!isDistrictDropdownOpen)}
              onClose={() => setIsDistrictDropdownOpen(false)}
            />
          </div>

          {selectedDistrict && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Taluka
              </label>
              <TalukaDropdown
                talukas={talukas}
                value={selectedTaluka}
                onChange={handleTalukaSelect}
                searchTerm={talukaSearchTerm}
                onSearchChange={setTalukaSearchTerm}
                isOpen={isTalukaDropdownOpen}
                onToggle={() => setIsTalukaDropdownOpen(!isTalukaDropdownOpen)}
                onClose={() => setIsTalukaDropdownOpen(false)}
              />
            </div>
          )}

          {resolvedCategory && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Resolved Category</h3>
              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                  resolvedCategory === 'I' ? 'bg-green-100 text-green-800' :
                  resolvedCategory === 'II' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Category {resolvedCategory}
                </span>
                <span className="text-sm text-gray-600">
                  {selectedDistrict} → {selectedTaluka}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDistrict || !selectedTaluka || !resolvedCategory}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
};

export default BenefitsModal;
