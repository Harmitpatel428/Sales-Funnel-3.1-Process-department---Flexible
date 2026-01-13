/**
 * Zapier Integration
 * Triggers Zaps via webhooks for workflow automation
 */

interface ZapierWebhookPayload {
    event: string;
    data: any;
    timestamp: string;
    source: string;
}

export class ZapierIntegration {
    private webhookUrl?: string;

    constructor(webhookUrl?: string) {
        this.webhookUrl = webhookUrl;
    }

    setWebhookUrl(url: string): void {
        this.webhookUrl = url;
    }

    async triggerZap(webhookUrl: string, data: any): Promise<boolean> {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async sendLeadToZap(webhookUrl: string, lead: any): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: 'lead.created',
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data: {
                id: lead.id,
                company: lead.company,
                contact: lead.clientName,
                email: lead.email,
                phone: lead.mobileNumber,
                status: lead.status,
                source: lead.source,
                notes: lead.notes,
                budget: lead.budget,
                createdAt: lead.createdAt,
            },
        };

        return this.triggerZap(webhookUrl, payload);
    }

    async sendLeadStatusChange(webhookUrl: string, lead: any, previousStatus: string): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: 'lead.status_changed',
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data: {
                id: lead.id,
                company: lead.company,
                contact: lead.clientName,
                email: lead.email,
                previousStatus,
                newStatus: lead.status,
                updatedAt: lead.updatedAt,
            },
        };

        return this.triggerZap(webhookUrl, payload);
    }

    async sendCaseCreated(webhookUrl: string, caseData: any, lead: any): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: 'case.created',
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data: {
                caseId: caseData.caseId,
                caseNumber: caseData.caseNumber,
                leadId: caseData.leadId,
                company: lead.company,
                contact: lead.clientName,
                email: lead.email,
                processStatus: caseData.processStatus,
                priority: caseData.priority,
                createdAt: caseData.createdAt,
            },
        };

        return this.triggerZap(webhookUrl, payload);
    }

    async sendDealWon(webhookUrl: string, lead: any): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: 'deal.won',
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data: {
                id: lead.id,
                company: lead.company,
                contact: lead.clientName,
                email: lead.email,
                budget: lead.budget,
                wonAt: new Date().toISOString(),
            },
        };

        return this.triggerZap(webhookUrl, payload);
    }

    async sendDocumentUploaded(webhookUrl: string, document: any): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: 'document.uploaded',
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data: {
                id: document.id,
                caseId: document.caseId,
                documentType: document.documentType,
                fileName: document.fileName,
                status: document.status,
                uploadedAt: document.createdAt,
            },
        };

        return this.triggerZap(webhookUrl, payload);
    }

    async sendCustomEvent(webhookUrl: string, eventName: string, data: any): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: eventName,
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data,
        };

        return this.triggerZap(webhookUrl, payload);
    }

    /**
     * Validate webhook URL by sending a test event
     */
    async testWebhook(webhookUrl: string): Promise<boolean> {
        const payload: ZapierWebhookPayload = {
            event: 'test',
            timestamp: new Date().toISOString(),
            source: 'sales-funnel-crm',
            data: {
                message: 'Test event from Sales Funnel CRM',
            },
        };

        return this.triggerZap(webhookUrl, payload);
    }
}

export function createZapierIntegration(webhookUrl?: string): ZapierIntegration {
    return new ZapierIntegration(webhookUrl);
}

// Pre-defined event types for Zapier triggers
export const ZAPIER_EVENTS = [
    'lead.created',
    'lead.updated',
    'lead.status_changed',
    'lead.assigned',
    'deal.won',
    'deal.lost',
    'case.created',
    'case.updated',
    'case.status_changed',
    'document.uploaded',
    'document.verified',
    'document.rejected',
    'workflow.completed',
    'approval.requested',
    'approval.completed',
] as const;

export type ZapierEvent = typeof ZAPIER_EVENTS[number];
