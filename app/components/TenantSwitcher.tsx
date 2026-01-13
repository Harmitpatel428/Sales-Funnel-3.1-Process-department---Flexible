'use client';

import { useState } from 'react';
import { useTenant } from '../context/TenantContext';

export default function TenantSwitcher() {
    const { currentTenant, availableTenants, isSuperAdmin, switchToTenant } = useTenant();
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    if (!isSuperAdmin || availableTenants.length === 0) {
        return null;
    }

    const handleSwitch = async (tenantId: string) => {
        setIsLoading(true);
        const result = await switchToTenant(tenantId);
        setIsLoading(false);

        if (result.success) {
            setIsOpen(false);
            // Reload page to refresh all data with new tenant context
            window.location.reload();
        } else {
            alert(result.message);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                disabled={isLoading}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="max-w-[150px] truncate">{currentTenant?.name || 'Select Tenant'}</span>
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-96 overflow-y-auto">
                        <div className="p-2">
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                                Switch Tenant
                            </div>
                            {availableTenants.map((tenant) => (
                                <button
                                    key={tenant.id}
                                    onClick={() => handleSwitch(tenant.id)}
                                    disabled={isLoading || tenant.id === currentTenant?.id}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${tenant.id === currentTenant?.id
                                            ? 'bg-purple-100 text-purple-700 font-medium'
                                            : 'text-gray-700 hover:bg-gray-100'
                                        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium">{tenant.name}</div>
                                            <div className="text-xs text-gray-500">{tenant.slug}</div>
                                        </div>
                                        {tenant.id === currentTenant?.id && (
                                            <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded ${tenant.subscriptionStatus === 'ACTIVE'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                            {tenant.subscriptionStatus}
                                        </span>
                                        <span className="text-xs text-gray-500">{tenant.subscriptionTier}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
