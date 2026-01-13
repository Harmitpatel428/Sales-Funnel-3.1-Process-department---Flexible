/**
 * QuickBooks Integration
 * Syncs customers and invoices with QuickBooks Online
 */

interface QuickBooksConfig {
    accessToken: string;
    realmId: string;
    refreshToken?: string;
    environment?: 'sandbox' | 'production';
}

export class QuickBooksIntegration {
    private accessToken: string;
    private realmId: string;
    private baseUrl: string;

    constructor(config: QuickBooksConfig) {
        this.accessToken = config.accessToken;
        this.realmId = config.realmId;
        this.baseUrl = config.environment === 'sandbox'
            ? 'https://sandbox-quickbooks.api.intuit.com'
            : 'https://quickbooks.api.intuit.com';
    }

    private async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
        const url = `${this.baseUrl}/v3/company/${this.realmId}${endpoint}`;

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`QuickBooks API error: ${JSON.stringify(error)}`);
        }

        return response.json();
    }

    async createCustomer(lead: any): Promise<string> {
        const nameParts = (lead.clientName || '').split(' ');

        const result = await this.request('/customer', 'POST', {
            DisplayName: lead.company || lead.clientName,
            CompanyName: lead.company,
            GivenName: nameParts[0],
            FamilyName: nameParts.slice(1).join(' '),
            PrimaryEmailAddr: lead.email ? { Address: lead.email } : undefined,
            PrimaryPhone: lead.mobileNumber ? { FreeFormNumber: lead.mobileNumber } : undefined,
            BillAddr: lead.companyLocation ? {
                Line1: lead.companyLocation,
            } : undefined,
        });

        return result.Customer.Id;
    }

    async updateCustomer(customerId: string, lead: any): Promise<void> {
        // First, get current customer to get SyncToken
        const current = await this.request(`/customer/${customerId}`);
        const nameParts = (lead.clientName || '').split(' ');

        await this.request('/customer', 'POST', {
            Id: customerId,
            SyncToken: current.Customer.SyncToken,
            DisplayName: lead.company || lead.clientName,
            CompanyName: lead.company,
            GivenName: nameParts[0],
            FamilyName: nameParts.slice(1).join(' '),
            PrimaryEmailAddr: lead.email ? { Address: lead.email } : undefined,
            PrimaryPhone: lead.mobileNumber ? { FreeFormNumber: lead.mobileNumber } : undefined,
        });
    }

    async findCustomerByEmail(email: string): Promise<any | null> {
        try {
            const query = encodeURIComponent(`SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email}'`);
            const result = await this.request(`/query?query=${query}`);
            return result.QueryResponse?.Customer?.[0] || null;
        } catch {
            return null;
        }
    }

    async findCustomerByName(displayName: string): Promise<any | null> {
        try {
            const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${displayName}'`);
            const result = await this.request(`/query?query=${query}`);
            return result.QueryResponse?.Customer?.[0] || null;
        } catch {
            return null;
        }
    }

    async createInvoice(customerId: string, items: { description: string; amount: number }[]): Promise<string> {
        const lineItems = items.map((item, index) => ({
            LineNum: index + 1,
            Amount: item.amount,
            DetailType: 'SalesItemLineDetail',
            Description: item.description,
            SalesItemLineDetail: {
                ItemRef: { value: '1', name: 'Services' }, // Default to Services item
            },
        }));

        const result = await this.request('/invoice', 'POST', {
            CustomerRef: { value: customerId },
            Line: lineItems,
        });

        return result.Invoice.Id;
    }

    async getCustomers(limit: number = 100): Promise<any[]> {
        const query = encodeURIComponent(`SELECT * FROM Customer MAXRESULTS ${limit}`);
        const result = await this.request(`/query?query=${query}`);
        return result.QueryResponse?.Customer || [];
    }

    async getInvoices(limit: number = 100): Promise<any[]> {
        const query = encodeURIComponent(`SELECT * FROM Invoice MAXRESULTS ${limit}`);
        const result = await this.request(`/query?query=${query}`);
        return result.QueryResponse?.Invoice || [];
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.request('/companyinfo/' + this.realmId);
            return true;
        } catch {
            return false;
        }
    }
}

export function createQuickBooksIntegration(config: QuickBooksConfig): QuickBooksIntegration {
    return new QuickBooksIntegration(config);
}
