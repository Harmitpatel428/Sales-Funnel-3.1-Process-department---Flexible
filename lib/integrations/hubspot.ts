/**
 * HubSpot Integration
 * Syncs leads as contacts and deals with HubSpot CRM
 */

interface HubSpotContact {
    id: string;
    properties: {
        firstname?: string;
        lastname?: string;
        email?: string;
        phone?: string;
        company?: string;
        [key: string]: string | undefined;
    };
}

interface HubSpotDeal {
    id: string;
    properties: {
        dealname: string;
        amount?: string;
        dealstage: string;
        pipeline: string;
        [key: string]: string | undefined;
    };
}

export class HubSpotIntegration {
    private accessToken: string;
    private baseUrl = 'https://api.hubapi.com';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    private async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`HubSpot API error: ${error.message || response.statusText}`);
        }

        return response.json();
    }

    async syncLead(lead: any): Promise<string> {
        const nameParts = (lead.clientName || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const contact = await this.request('/crm/v3/objects/contacts', 'POST', {
            properties: {
                firstname: firstName,
                lastname: lastName || 'Unknown',
                email: lead.email,
                phone: lead.mobileNumber,
                company: lead.company,
                hs_lead_status: this.mapLeadStatus(lead.status),
            },
        });

        return contact.id;
    }

    async syncDeal(lead: any, contactId: string): Promise<string> {
        const deal = await this.request('/crm/v3/objects/deals', 'POST', {
            properties: {
                dealname: `${lead.company || lead.clientName} - ${lead.status}`,
                amount: lead.budget ? lead.budget.replace(/[^0-9.]/g, '') : undefined,
                dealstage: this.mapStatusToDealStage(lead.status),
                pipeline: 'default',
            },
            associations: [
                {
                    to: { id: contactId },
                    types: [
                        {
                            associationCategory: 'HUBSPOT_DEFINED',
                            associationTypeId: 3, // Deal to Contact
                        },
                    ],
                },
            ],
        });

        return deal.id;
    }

    async updateContact(hubspotId: string, lead: any): Promise<void> {
        const nameParts = (lead.clientName || '').split(' ');

        await this.request(`/crm/v3/objects/contacts/${hubspotId}`, 'PATCH', {
            properties: {
                firstname: nameParts[0] || '',
                lastname: nameParts.slice(1).join(' ') || '',
                email: lead.email,
                phone: lead.mobileNumber,
                company: lead.company,
                hs_lead_status: this.mapLeadStatus(lead.status),
            },
        });
    }

    async findContactByEmail(email: string): Promise<HubSpotContact | null> {
        try {
            const result = await this.request(
                `/crm/v3/objects/contacts/search`,
                'POST',
                {
                    filterGroups: [
                        {
                            filters: [
                                { propertyName: 'email', operator: 'EQ', value: email },
                            ],
                        },
                    ],
                }
            );
            return result.results?.[0] || null;
        } catch {
            return null;
        }
    }

    async getDeals(limit: number = 10): Promise<HubSpotDeal[]> {
        const result = await this.request(`/crm/v3/objects/deals?limit=${limit}`);
        return result.results;
    }

    private mapLeadStatus(status: string): string {
        const mapping: Record<string, string> = {
            NEW: 'NEW',
            CONTACTED: 'OPEN',
            QUALIFIED: 'OPEN',
            PROPOSAL: 'IN_PROGRESS',
            NEGOTIATION: 'IN_PROGRESS',
            WON: 'CONNECTED',
            LOST: 'BAD_TIMING',
        };
        return mapping[status] || 'NEW';
    }

    private mapStatusToDealStage(status: string): string {
        const mapping: Record<string, string> = {
            NEW: 'appointmentscheduled',
            CONTACTED: 'qualifiedtobuy',
            QUALIFIED: 'presentationscheduled',
            PROPOSAL: 'decisionmakerboughtin',
            NEGOTIATION: 'contractsent',
            WON: 'closedwon',
            LOST: 'closedlost',
        };
        return mapping[status] || 'appointmentscheduled';
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.request('/crm/v3/objects/contacts?limit=1');
            return true;
        } catch {
            return false;
        }
    }
}

export function createHubSpotIntegration(accessToken: string): HubSpotIntegration {
    return new HubSpotIntegration(accessToken);
}
