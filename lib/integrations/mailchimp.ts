/**
 * Mailchimp Integration
 * Manages email marketing lists and campaigns
 */

interface MailchimpConfig {
    apiKey: string;
    serverPrefix: string; // e.g., 'us1', 'us2', etc.
}

export class MailchimpIntegration {
    private apiKey: string;
    private baseUrl: string;

    constructor(config: MailchimpConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = `https://${config.serverPrefix}.api.mailchimp.com/3.0`;
    }

    private async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers: {
                'Authorization': `Basic ${Buffer.from(`anystring:${this.apiKey}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`Mailchimp API error: ${error.detail || response.statusText}`);
        }

        return response.json();
    }

    async addToList(listId: string, lead: any, tags?: string[]): Promise<void> {
        const nameParts = (lead.clientName || '').split(' ');

        const subscriberHash = await this.getSubscriberHash(lead.email);

        await this.request(`/lists/${listId}/members/${subscriberHash}`, 'PUT', {
            email_address: lead.email,
            status: 'subscribed',
            merge_fields: {
                FNAME: nameParts[0] || '',
                LNAME: nameParts.slice(1).join(' ') || '',
                PHONE: lead.mobileNumber || '',
                COMPANY: lead.company || '',
            },
            tags: tags || [],
        });
    }

    async removeFromList(listId: string, email: string): Promise<void> {
        const subscriberHash = await this.getSubscriberHash(email);
        await this.request(`/lists/${listId}/members/${subscriberHash}`, 'DELETE');
    }

    async updateSubscriber(listId: string, email: string, data: any): Promise<void> {
        const subscriberHash = await this.getSubscriberHash(email);
        await this.request(`/lists/${listId}/members/${subscriberHash}`, 'PATCH', data);
    }

    async addTags(listId: string, email: string, tags: string[]): Promise<void> {
        const subscriberHash = await this.getSubscriberHash(email);
        await this.request(`/lists/${listId}/members/${subscriberHash}/tags`, 'POST', {
            tags: tags.map(tag => ({ name: tag, status: 'active' })),
        });
    }

    async removeTags(listId: string, email: string, tags: string[]): Promise<void> {
        const subscriberHash = await this.getSubscriberHash(email);
        await this.request(`/lists/${listId}/members/${subscriberHash}/tags`, 'POST', {
            tags: tags.map(tag => ({ name: tag, status: 'inactive' })),
        });
    }

    async createCampaign(
        listId: string,
        subject: string,
        content: string,
        options?: {
            fromName?: string;
            replyTo?: string;
        }
    ): Promise<string> {
        // Create campaign
        const campaign = await this.request('/campaigns', 'POST', {
            type: 'regular',
            recipients: { list_id: listId },
            settings: {
                subject_line: subject,
                from_name: options?.fromName || 'Sales Team',
                reply_to: options?.replyTo || process.env.SMTP_FROM_EMAIL,
            },
        });

        // Set content
        await this.request(`/campaigns/${campaign.id}/content`, 'PUT', {
            html: content,
        });

        return campaign.id;
    }

    async sendCampaign(campaignId: string): Promise<void> {
        await this.request(`/campaigns/${campaignId}/actions/send`, 'POST');
    }

    async scheduleCampaign(campaignId: string, scheduleTime: Date): Promise<void> {
        await this.request(`/campaigns/${campaignId}/actions/schedule`, 'POST', {
            schedule_time: scheduleTime.toISOString(),
        });
    }

    async getLists(): Promise<{ id: string; name: string; memberCount: number }[]> {
        const result = await this.request('/lists');
        return result.lists.map((list: any) => ({
            id: list.id,
            name: list.name,
            memberCount: list.stats.member_count,
        }));
    }

    async getCampaigns(limit: number = 10): Promise<any[]> {
        const result = await this.request(`/campaigns?count=${limit}`);
        return result.campaigns;
    }

    async getCampaignReport(campaignId: string): Promise<any> {
        return this.request(`/reports/${campaignId}`);
    }

    private async getSubscriberHash(email: string): Promise<string> {
        const crypto = await import('crypto');
        return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.request('/ping');
            return true;
        } catch {
            return false;
        }
    }
}

export function createMailchimpIntegration(config: MailchimpConfig): MailchimpIntegration {
    return new MailchimpIntegration(config);
}
