/**
 * Salesforce Integration
 * Syncs leads with Salesforce CRM
 */

interface SalesforceConfig {
    accessToken: string;
    instanceUrl: string;
    refreshToken?: string;
}

export class SalesforceIntegration {
    private accessToken: string;
    private instanceUrl: string;
    private apiVersion = 'v58.0';

    constructor(config: SalesforceConfig) {
        this.accessToken = config.accessToken;
        this.instanceUrl = config.instanceUrl;
    }

    private async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
        const url = `${this.instanceUrl}/services/data/${this.apiVersion}${endpoint}`;

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`Salesforce API error: ${JSON.stringify(error)}`);
        }

        // Some endpoints return empty response
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }

    async syncLead(lead: any): Promise<string> {
        const nameParts = (lead.clientName || '').split(' ');

        const result = await this.request('/sobjects/Lead', 'POST', {
            FirstName: nameParts[0] || '',
            LastName: nameParts.slice(1).join(' ') || 'Unknown',
            Company: lead.company || 'Unknown',
            Email: lead.email,
            Phone: lead.mobileNumber,
            Status: this.mapStatus(lead.status),
            LeadSource: lead.source || 'Web',
            Description: lead.notes,
        });

        return result.id;
    }

    async updateLead(salesforceId: string, lead: any): Promise<void> {
        const nameParts = (lead.clientName || '').split(' ');

        await this.request(`/sobjects/Lead/${salesforceId}`, 'PATCH', {
            FirstName: nameParts[0] || '',
            LastName: nameParts.slice(1).join(' ') || 'Unknown',
            Company: lead.company,
            Email: lead.email,
            Phone: lead.mobileNumber,
            Status: this.mapStatus(lead.status),
        });
    }

    async findLeadByEmail(email: string): Promise<any | null> {
        try {
            const result = await this.request(
                `/query?q=${encodeURIComponent(`SELECT Id, FirstName, LastName, Email, Company, Status FROM Lead WHERE Email = '${email}' LIMIT 1`)}`
            );
            return result.records?.[0] || null;
        } catch {
            return null;
        }
    }

    async convertLeadToOpportunity(leadId: string, opportunityName: string): Promise<string> {
        const result = await this.request('/sobjects/Opportunity', 'POST', {
            Name: opportunityName,
            StageName: 'Prospecting',
            CloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });

        return result.id;
    }

    async createAccount(lead: any): Promise<string> {
        const result = await this.request('/sobjects/Account', 'POST', {
            Name: lead.company || lead.clientName,
            Phone: lead.mobileNumber,
            Website: lead.websiteUrl,
        });

        return result.id;
    }

    async createContact(lead: any, accountId: string): Promise<string> {
        const nameParts = (lead.clientName || '').split(' ');

        const result = await this.request('/sobjects/Contact', 'POST', {
            FirstName: nameParts[0] || '',
            LastName: nameParts.slice(1).join(' ') || 'Unknown',
            Email: lead.email,
            Phone: lead.mobileNumber,
            AccountId: accountId,
        });

        return result.id;
    }

    private mapStatus(status: string): string {
        const mapping: Record<string, string> = {
            NEW: 'Open - Not Contacted',
            CONTACTED: 'Working - Contacted',
            QUALIFIED: 'Qualified',
            PROPOSAL: 'Qualified',
            NEGOTIATION: 'Qualified',
            WON: 'Closed - Converted',
            LOST: 'Closed - Not Converted',
        };
        return mapping[status] || 'Open - Not Contacted';
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.request('/sobjects');
            return true;
        } catch {
            return false;
        }
    }

    async getRecentLeads(limit: number = 10): Promise<any[]> {
        const result = await this.request(
            `/query?q=${encodeURIComponent(`SELECT Id, FirstName, LastName, Email, Company, Status, CreatedDate FROM Lead ORDER BY CreatedDate DESC LIMIT ${limit}`)}`
        );
        return result.records;
    }
}

export function createSalesforceIntegration(config: SalesforceConfig): SalesforceIntegration {
    return new SalesforceIntegration(config);
}
