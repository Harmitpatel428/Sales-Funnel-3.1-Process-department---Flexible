'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { getTenantForUser, switchTenant, getTenants } from '../actions/tenant';

export interface Tenant {
    id: string;
    name: string;
    subdomain: string | null;
    slug: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    brandingConfig: Record<string, unknown>;
    features: Record<string, unknown>;
    isActive: boolean;
}

export interface TenantContextType {
    currentTenant: Tenant | null;
    availableTenants: Tenant[];
    isLoading: boolean;
    isSuperAdmin: boolean;
    switchToTenant: (tenantId: string) => Promise<{ success: boolean; message: string }>;
    refreshTenant: () => Promise<void>;
    refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
    const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
    const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    // Fetch current tenant from server
    const refreshTenant = useCallback(async () => {
        try {
            const result = await getTenantForUser();
            if (result.success && result.tenant) {
                setCurrentTenant(result.tenant);
                setIsSuperAdmin(result.isSuperAdmin || false);
            } else {
                setCurrentTenant(null);
                setIsSuperAdmin(false);
            }
        } catch (error) {
            console.error('Failed to fetch tenant:', error);
            setCurrentTenant(null);
        }
    }, []);

    // Fetch all tenants (for super-admin)
    const refreshTenants = useCallback(async () => {
        if (!isSuperAdmin) return;

        try {
            const result = await getTenants();
            if (result.success && result.tenants) {
                setAvailableTenants(result.tenants);
            }
        } catch (error) {
            console.error('Failed to fetch tenants:', error);
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        const init = async () => {
            await refreshTenant();
            setIsLoading(false);
        };
        init();
    }, [refreshTenant]);

    useEffect(() => {
        if (isSuperAdmin) {
            refreshTenants();
        }
    }, [isSuperAdmin, refreshTenants]);

    const switchToTenant = useCallback(async (tenantId: string): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await switchTenant(tenantId);
            if (result.success) {
                await refreshTenant();
            }
            return result;
        } catch (error) {
            console.error('Tenant switch error:', error);
            return { success: false, message: 'Failed to switch tenant' };
        }
    }, [refreshTenant]);

    const contextValue: TenantContextType = useMemo(() => ({
        currentTenant,
        availableTenants,
        isLoading,
        isSuperAdmin,
        switchToTenant,
        refreshTenant,
        refreshTenants,
    }), [currentTenant, availableTenants, isLoading, isSuperAdmin, switchToTenant, refreshTenant, refreshTenants]);

    // Don't block rendering with loading state - let children handle loading
    return (
        <TenantContext.Provider value={contextValue}>
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant(): TenantContextType {
    const context = useContext(TenantContext);
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return context;
}
