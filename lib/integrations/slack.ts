/**
 * Slack Integration
 * Provides notifications and lead alerts via Slack
 */

interface SlackMessage {
    channel: string;
    text?: string;
    blocks?: any[];
    attachments?: any[];
}

export class SlackIntegration {
    private accessToken: string;
    private baseUrl = 'https://slack.com/api';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    private async request(endpoint: string, data: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (!result.ok) {
            throw new Error(`Slack API error: ${result.error}`);
        }
        return result;
    }

    async sendNotification(channel: string, message: string): Promise<void> {
        await this.request('chat.postMessage', {
            channel,
            text: message,
        });
    }

    async notifyNewLead(lead: any, channel: string): Promise<void> {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        await this.request('chat.postMessage', {
            channel,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🎯 New Lead Created',
                        emoji: true,
                    },
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Company:*\n${lead.company || 'N/A'}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Contact:*\n${lead.clientName || 'N/A'}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Email:*\n${lead.email || 'N/A'}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Phone:*\n${lead.mobileNumber || 'N/A'}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Source:*\n${lead.source || 'N/A'}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Status:*\n${lead.status}`,
                        },
                    ],
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'View Lead',
                                emoji: true,
                            },
                            url: `${appUrl}/leads/${lead.id}`,
                            style: 'primary',
                        },
                    ],
                },
            ],
        });
    }

    async notifyLeadStatusChange(lead: any, oldStatus: string, channel: string): Promise<void> {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        await this.request('chat.postMessage', {
            channel,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `📊 *Lead Status Updated*\n*${lead.company || lead.clientName}*: ${oldStatus} → ${lead.status}`,
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View',
                        },
                        url: `${appUrl}/leads/${lead.id}`,
                    },
                },
            ],
        });
    }

    async notifyDealWon(lead: any, channel: string): Promise<void> {
        await this.request('chat.postMessage', {
            channel,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `🎉 *Deal Won!*\n*${lead.company || lead.clientName}*\n${lead.budget ? `Value: ${lead.budget}` : ''}`,
                    },
                },
            ],
        });
    }

    async getChannels(): Promise<{ id: string; name: string }[]> {
        const result = await this.request('conversations.list', {
            types: 'public_channel,private_channel',
        });
        return result.channels.map((c: any) => ({ id: c.id, name: c.name }));
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.request('auth.test', {});
            return true;
        } catch {
            return false;
        }
    }
}

export function createSlackIntegration(accessToken: string): SlackIntegration {
    return new SlackIntegration(accessToken);
}
