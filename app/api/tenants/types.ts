/**
 * Tenant API Types
 * Shared TypeScript types for tenant API requests and responses
 */

// Tenant representation returned from API
export interface TenantResponse {
    id: string;
    name: string;
    subdomain: string | null;
    slug: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    brandingConfig: Record<string, unknown>;
    features: Record<string, unknown>;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// Request body for creating a tenant
export interface CreateTenantRequest {
    name: string;
    subdomain?: string;
    slug: string;
    subscriptionTier?: string;
}

// Request body for updating a tenant
export interface UpdateTenantRequest {
    name?: string;
    subdomain?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    brandingConfig?: Record<string, unknown>;
    features?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    workflowSettings?: Record<string, unknown>;
    isActive?: boolean;
}

// Response for list tenants
export interface ListTenantsResponse {
    success: boolean;
    tenants?: TenantResponse[];
    message?: string;
}

// Response for single tenant operations
export interface TenantOperationResponse {
    success: boolean;
    tenant?: TenantResponse;
    tenantId?: string;
    message?: string;
}
