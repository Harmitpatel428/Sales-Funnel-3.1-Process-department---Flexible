import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/integrations
 * List available integrations
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_VIEW]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');
        const installedOnly = searchParams.get('installed') === 'true';

        // Get all available integrations
        const where: any = { isActive: true };
        if (category) where.category = category;

        const integrations = await prisma.integration.findMany({
            where,
            orderBy: [{ isOfficial: 'desc' }, { name: 'asc' }],
        });

        // Get installed integrations for this tenant
        const installations = await prisma.integrationInstallation.findMany({
            where: { tenantId: session.tenantId },
            select: {
                integrationId: true,
                isActive: true,
                lastSyncAt: true,
                syncStatus: true,
            },
        });

        const installationMap = new Map(installations.map(i => [i.integrationId, i]));

        let result = integrations.map(integration => ({
            ...integration,
            configSchema: JSON.parse(integration.configSchema),
            installed: installationMap.has(integration.id),
            installation: installationMap.get(integration.id) || null,
        }));

        if (installedOnly) {
            result = result.filter(i => i.installed);
        }

        // Get categories for filtering
        const categories = await prisma.integration.groupBy({
            by: ['category'],
            where: { isActive: true },
            _count: { id: true },
        });

        return NextResponse.json({
            success: true,
            data: result,
            meta: {
                total: result.length,
                categories: categories.map(c => ({
                    name: c.category,
                    count: c._count.id,
                })),
            },
        });
    }
);

/**
 * POST /api/integrations
 * Seed official integrations (admin only)
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        // Seed official integrations
        const officialIntegrations = [
            {
                name: 'Slack',
                slug: 'slack',
                category: 'COMMUNICATION',
                description: 'Send lead notifications and alerts to Slack channels',
                logoUrl: '/integrations/slack.svg',
                websiteUrl: 'https://slack.com',
                configSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', title: 'Bot Access Token' },
                        defaultChannel: { type: 'string', title: 'Default Channel' },
                        notifyNewLeads: { type: 'boolean', title: 'Notify on New Leads', default: true },
                        notifyStatusChanges: { type: 'boolean', title: 'Notify on Status Changes', default: true },
                    },
                    required: ['accessToken'],
                }),
                authType: 'OAUTH2',
                isOfficial: true,
            },
            {
                name: 'HubSpot',
                slug: 'hubspot',
                category: 'CRM',
                description: 'Sync leads with HubSpot CRM as contacts and deals',
                logoUrl: '/integrations/hubspot.svg',
                websiteUrl: 'https://hubspot.com',
                configSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', title: 'Access Token' },
                        syncContacts: { type: 'boolean', title: 'Sync as Contacts', default: true },
                        syncDeals: { type: 'boolean', title: 'Sync as Deals', default: true },
                        autoSync: { type: 'boolean', title: 'Auto-sync on Changes', default: false },
                    },
                    required: ['accessToken'],
                }),
                authType: 'OAUTH2',
                isOfficial: true,
            },
            {
                name: 'Salesforce',
                slug: 'salesforce',
                category: 'CRM',
                description: 'Sync leads with Salesforce CRM',
                logoUrl: '/integrations/salesforce.svg',
                websiteUrl: 'https://salesforce.com',
                configSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', title: 'Access Token' },
                        instanceUrl: { type: 'string', title: 'Instance URL' },
                        syncLeads: { type: 'boolean', title: 'Sync as Leads', default: true },
                        syncOpportunities: { type: 'boolean', title: 'Sync as Opportunities', default: false },
                    },
                    required: ['accessToken', 'instanceUrl'],
                }),
                authType: 'OAUTH2',
                isOfficial: true,
            },
            {
                name: 'QuickBooks',
                slug: 'quickbooks',
                category: 'ACCOUNTING',
                description: 'Sync customers and create invoices in QuickBooks',
                logoUrl: '/integrations/quickbooks.svg',
                websiteUrl: 'https://quickbooks.intuit.com',
                configSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', title: 'Access Token' },
                        realmId: { type: 'string', title: 'Company ID (Realm ID)' },
                        syncCustomers: { type: 'boolean', title: 'Sync Customers', default: true },
                        createInvoices: { type: 'boolean', title: 'Create Invoices on Deal Won', default: false },
                    },
                    required: ['accessToken', 'realmId'],
                }),
                authType: 'OAUTH2',
                isOfficial: true,
            },
            {
                name: 'Mailchimp',
                slug: 'mailchimp',
                category: 'EMAIL',
                description: 'Sync leads to Mailchimp lists for email marketing',
                logoUrl: '/integrations/mailchimp.svg',
                websiteUrl: 'https://mailchimp.com',
                configSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        apiKey: { type: 'string', title: 'API Key' },
                        serverPrefix: { type: 'string', title: 'Server Prefix (e.g., us1)' },
                        defaultListId: { type: 'string', title: 'Default List ID' },
                        syncOnCreate: { type: 'boolean', title: 'Sync on Lead Create', default: true },
                    },
                    required: ['apiKey', 'serverPrefix'],
                }),
                authType: 'API_KEY',
                isOfficial: true,
            },
            {
                name: 'Zapier',
                slug: 'zapier',
                category: 'AUTOMATION',
                description: 'Connect with 5000+ apps via Zapier webhooks',
                logoUrl: '/integrations/zapier.svg',
                websiteUrl: 'https://zapier.com',
                configSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        webhookUrl: { type: 'string', title: 'Zapier Webhook URL' },
                        events: {
                            type: 'array',
                            title: 'Trigger Events',
                            items: {
                                type: 'string',
                                enum: ['lead.created', 'lead.updated', 'lead.status_changed', 'deal.won', 'case.created'],
                            },
                        },
                    },
                    required: ['webhookUrl'],
                }),
                authType: 'NONE',
                isOfficial: true,
            },
        ];

        for (const integration of officialIntegrations) {
            await prisma.integration.upsert({
                where: { slug: integration.slug },
                update: integration,
                create: integration,
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Official integrations seeded successfully',
            data: { count: officialIntegrations.length },
        });
    }
);
