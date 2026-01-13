/**
 * Sales Funnel CRM SDK for JavaScript/TypeScript
 * 
 * Installation:
 *   npm install @sales-funnel/crm-sdk
 * 
 * Usage:
 *   import { CRMClient } from '@sales-funnel/crm-sdk';
 *   const client = new CRMClient({ apiKey: 'your_api_key' });
 */

interface CRMClientConfig {
    apiKey: string;
    baseUrl?: string;
}

interface PaginationParams {
    page?: number;
    limit?: number;
}

interface LeadCreateParams {
    clientName: string;
    email?: string;
    mobileNumber?: string;
    company?: string;
    source?: string;
    status?: string;
    notes?: string;
    customFields?: Record<string, any>;
}

interface LeadListParams extends PaginationParams {
    status?: string;
    search?: string;
    assignedToId?: string;
}

interface WebhookSubscribeParams {
    url: string;
    events: string[];
    authType?: 'API_KEY' | 'BEARER' | 'HMAC';
    authConfig?: Record<string, any>;
}

export class CRMClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(config: CRMClientConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.example.com';
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new CRMError(
                data.error?.message || 'API request failed',
                data.error?.code || 'UNKNOWN_ERROR',
                response.status
            );
        }

        return data;
    }

    private buildQueryString(params: Record<string, any>): string {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                query.append(key, String(value));
            }
        }
        const str = query.toString();
        return str ? `?${str}` : '';
    }

    /**
     * Lead operations
     */
    leads = {
        /**
         * List leads with optional filtering
         */
        list: async (params?: LeadListParams) => {
            return this.request<{
                success: boolean;
                data: { leads: any[]; total: number; page: number; totalPages: number };
            }>(`/api/v1/leads${this.buildQueryString(params || {})}`);
        },

        /**
         * Get a single lead by ID
         */
        get: async (id: string) => {
            return this.request<{ success: boolean; data: any }>(`/api/v1/leads/${id}`);
        },

        /**
         * Create a new lead
         */
        create: async (data: LeadCreateParams) => {
            return this.request<{ success: boolean; data: any }>('/api/v1/leads', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },

        /**
         * Update an existing lead
         */
        update: async (id: string, data: Partial<LeadCreateParams>) => {
            return this.request<{ success: boolean; data: any }>(`/api/v1/leads/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        },

        /**
         * Delete a lead
         */
        delete: async (id: string) => {
            return this.request<{ success: boolean; message: string }>(`/api/v1/leads/${id}`, {
                method: 'DELETE',
            });
        },

        /**
         * Bulk import leads
         */
        bulkImport: async (records: LeadCreateParams[], options?: { skipDuplicates?: boolean }) => {
            return this.request<{
                success: boolean;
                data: {
                    total: number;
                    successful: number;
                    failed: number;
                    errors: any[];
                };
            }>('/api/bulk/import', {
                method: 'POST',
                body: JSON.stringify({ records, entityType: 'leads', options }),
            });
        },

        /**
         * Export leads
         */
        export: async (format: 'json' | 'csv' = 'json', params?: { status?: string }) => {
            return this.request<any>(
                `/api/bulk/export${this.buildQueryString({ format, entityType: 'leads', ...params })}`
            );
        },
    };

    /**
     * Case operations
     */
    cases = {
        list: async (params?: PaginationParams & { status?: string }) => {
            return this.request<{ success: boolean; data: any }>(`/api/v1/cases${this.buildQueryString(params || {})}`);
        },

        get: async (id: string) => {
            return this.request<{ success: boolean; data: any }>(`/api/v1/cases/${id}`);
        },
    };

    /**
     * Webhook operations
     */
    webhooks = {
        /**
         * List webhook subscriptions
         */
        list: async () => {
            return this.request<{ success: boolean; data: any[] }>('/api/webhooks/outgoing');
        },

        /**
         * Subscribe to webhook events
         */
        subscribe: async (params: WebhookSubscribeParams) => {
            return this.request<{ success: boolean; data: any }>('/api/webhooks/outgoing', {
                method: 'POST',
                body: JSON.stringify(params),
            });
        },

        /**
         * Unsubscribe from webhook
         */
        unsubscribe: async (id: string) => {
            return this.request<{ success: boolean }>(`/api/webhooks/outgoing/${id}`, {
                method: 'DELETE',
            });
        },
    };

    /**
     * Integration operations
     */
    integrations = {
        /**
         * List available integrations
         */
        list: async (params?: { category?: string }) => {
            return this.request<{ success: boolean; data: any[] }>(`/api/integrations${this.buildQueryString(params || {})}`);
        },

        /**
         * Install an integration
         */
        install: async (slug: string, config: Record<string, any>) => {
            return this.request<{ success: boolean; data: any }>(`/api/integrations/${slug}/install`, {
                method: 'POST',
                body: JSON.stringify({ config }),
            });
        },

        /**
         * Uninstall an integration
         */
        uninstall: async (slug: string) => {
            return this.request<{ success: boolean }>(`/api/integrations/${slug}/install`, {
                method: 'DELETE',
            });
        },
    };

    /**
     * Analytics operations
     */
    analytics = {
        /**
         * Get API usage statistics
         */
        usage: async (days: number = 30) => {
            return this.request<{ success: boolean; data: any }>(`/api/analytics/usage?days=${days}`);
        },
    };
}

/**
 * CRM API Error
 */
export class CRMError extends Error {
    code: string;
    status: number;

    constructor(message: string, code: string, status: number) {
        super(message);
        this.name = 'CRMError';
        this.code = code;
        this.status = status;
    }
}

/**
 * Create a CRM client instance
 */
export function createClient(config: CRMClientConfig): CRMClient {
    return new CRMClient(config);
}

// Default export
export default CRMClient;
