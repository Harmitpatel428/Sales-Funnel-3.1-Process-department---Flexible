// Seed script for API platform integrations
import { prisma } from '../lib/db';

async function seedIntegrations() {
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

    console.log('Seeding official integrations...');

    for (const integration of officialIntegrations) {
        await prisma.integration.upsert({
            where: { slug: integration.slug },
            update: integration,
            create: integration,
        });
        console.log(`  ✓ ${integration.name}`);
    }

    console.log(`\nSeeded ${officialIntegrations.length} integrations successfully!`);
}

seedIntegrations()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
