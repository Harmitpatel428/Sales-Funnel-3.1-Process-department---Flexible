import { OpenAPIV3 } from 'openapi-types';

// OpenAPI specification generator
export function generateOpenAPISpec(): OpenAPIV3.Document {
    return {
        openapi: '3.0.0',
        info: {
            title: 'Sales Funnel CRM API',
            version: '1.0.0',
            description: `
# Sales Funnel CRM API

Enterprise Lead Management & CRM System API for managing leads, cases, documents, workflows, and integrations.

## Authentication

All API requests require authentication using an API key. You can obtain an API key from the Developer Portal.

Include your API key in the request header:
\`\`\`
X-API-Key: sk_live_your_api_key_here
\`\`\`

Or use Bearer token authentication:
\`\`\`
Authorization: Bearer sk_live_your_api_key_here
\`\`\`

## Rate Limiting

API requests are rate-limited per API key. Default limit is 1000 requests per hour.
Rate limit information is included in response headers:
- \`X-RateLimit-Limit\`: Maximum requests per hour
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`X-RateLimit-Reset\`: Time when the rate limit resets

## Errors

The API uses standard HTTP response codes:
- \`200\`: Success
- \`201\`: Created
- \`400\`: Bad Request
- \`401\`: Unauthorized
- \`403\`: Forbidden
- \`404\`: Not Found
- \`429\`: Rate Limit Exceeded
- \`500\`: Internal Server Error

Error responses include a JSON body with error details.
      `.trim(),
            contact: {
                name: 'API Support',
                email: 'api@example.com',
                url: 'https://developers.example.com',
            },
            license: {
                name: 'Proprietary',
                url: 'https://example.com/terms',
            },
        },
        servers: [
            {
                url: process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com',
                description: 'Production server',
            },
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
        security: [
            { ApiKeyAuth: [] },
            { BearerAuth: [] },
        ],
        tags: [
            { name: 'Leads', description: 'Lead management operations' },
            { name: 'Cases', description: 'Case management operations' },
            { name: 'Documents', description: 'Document management operations' },
            { name: 'Workflows', description: 'Workflow automation operations' },
            { name: 'Webhooks', description: 'Webhook subscription management' },
            { name: 'Integrations', description: 'Third-party integration management' },
            { name: 'Users', description: 'User management operations' },
            { name: 'Reports', description: 'Reporting and analytics' },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for authentication',
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'Bearer token authentication (use API key as token)',
                },
            },
            schemas: {
                Lead: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Unique lead identifier' },
                        clientName: { type: 'string', description: 'Client/contact name' },
                        mobileNumber: { type: 'string', description: 'Primary mobile number' },
                        email: { type: 'string', format: 'email', description: 'Email address' },
                        company: { type: 'string', description: 'Company name' },
                        source: { type: 'string', description: 'Lead source' },
                        status: {
                            type: 'string',
                            enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'],
                            description: 'Lead status'
                        },
                        notes: { type: 'string', description: 'Additional notes' },
                        kva: { type: 'string', description: 'KVA value' },
                        connectionDate: { type: 'string', format: 'date-time' },
                        consumerNumber: { type: 'string' },
                        discom: { type: 'string' },
                        gidc: { type: 'string' },
                        gstNumber: { type: 'string' },
                        companyLocation: { type: 'string' },
                        unitType: { type: 'string' },
                        marketingObjective: { type: 'string' },
                        budget: { type: 'string' },
                        termLoan: { type: 'string' },
                        timeline: { type: 'string' },
                        contactOwner: { type: 'string' },
                        followUpDate: { type: 'string', format: 'date-time' },
                        assignedToId: { type: 'string' },
                        customFields: { type: 'object', additionalProperties: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                LeadCreate: {
                    type: 'object',
                    required: ['clientName'],
                    properties: {
                        clientName: { type: 'string', description: 'Client/contact name' },
                        mobileNumber: { type: 'string', description: 'Primary mobile number' },
                        email: { type: 'string', format: 'email', description: 'Email address' },
                        company: { type: 'string', description: 'Company name' },
                        source: { type: 'string', description: 'Lead source' },
                        status: { type: 'string', enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] },
                        notes: { type: 'string' },
                        customFields: { type: 'object', additionalProperties: true },
                    },
                },
                Case: {
                    type: 'object',
                    properties: {
                        caseId: { type: 'string', description: 'Unique case identifier' },
                        leadId: { type: 'string', description: 'Associated lead ID' },
                        caseNumber: { type: 'string', description: 'Case number' },
                        schemeType: { type: 'string' },
                        caseType: { type: 'string' },
                        benefitTypes: { type: 'array', items: { type: 'string' } },
                        processStatus: {
                            type: 'string',
                            enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'ON_HOLD'],
                        },
                        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
                        clientName: { type: 'string' },
                        company: { type: 'string' },
                        mobileNumber: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                Document: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        caseId: { type: 'string' },
                        documentType: { type: 'string' },
                        fileName: { type: 'string' },
                        fileSize: { type: 'integer' },
                        mimeType: { type: 'string' },
                        status: { type: 'string', enum: ['PENDING', 'RECEIVED', 'VERIFIED', 'REJECTED'] },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                WebhookSubscription: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                        events: { type: 'array', items: { type: 'string' } },
                        authType: { type: 'string', enum: ['API_KEY', 'BEARER', 'HMAC'] },
                        isActive: { type: 'boolean' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                WebhookSubscriptionCreate: {
                    type: 'object',
                    required: ['url', 'events'],
                    properties: {
                        url: { type: 'string', format: 'uri', description: 'Webhook endpoint URL' },
                        events: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Event types to subscribe to',
                            example: ['lead.created', 'lead.updated', 'case.created'],
                        },
                        authType: { type: 'string', enum: ['API_KEY', 'BEARER', 'HMAC'] },
                        authConfig: { type: 'object', description: 'Authentication configuration' },
                    },
                },
                Integration: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        slug: { type: 'string' },
                        category: { type: 'string' },
                        description: { type: 'string' },
                        logoUrl: { type: 'string' },
                        isActive: { type: 'boolean' },
                        isOfficial: { type: 'boolean' },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
                PaginatedResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                        pagination: {
                            type: 'object',
                            properties: {
                                total: { type: 'integer' },
                                page: { type: 'integer' },
                                limit: { type: 'integer' },
                                totalPages: { type: 'integer' },
                            },
                        },
                    },
                },
            },
            parameters: {
                PageParam: {
                    name: 'page',
                    in: 'query',
                    schema: { type: 'integer', default: 1, minimum: 1 },
                    description: 'Page number',
                },
                LimitParam: {
                    name: 'limit',
                    in: 'query',
                    schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
                    description: 'Number of items per page',
                },
                SearchParam: {
                    name: 'search',
                    in: 'query',
                    schema: { type: 'string' },
                    description: 'Search query',
                },
            },
            responses: {
                UnauthorizedError: {
                    description: 'Unauthorized - Invalid or missing API key',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: {
                                success: false,
                                error: { code: 'UNAUTHORIZED', message: 'API key required' },
                            },
                        },
                    },
                },
                ForbiddenError: {
                    description: 'Forbidden - Insufficient permissions',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                        },
                    },
                },
                NotFoundError: {
                    description: 'Resource not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                        },
                    },
                },
                RateLimitError: {
                    description: 'Rate limit exceeded',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: {
                                success: false,
                                error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' },
                            },
                        },
                    },
                },
            },
        },
        paths: {
            '/api/v1/leads': {
                get: {
                    summary: 'List leads',
                    description: 'Retrieve a paginated list of leads with optional filtering and search.',
                    tags: ['Leads'],
                    parameters: [
                        { $ref: '#/components/parameters/PageParam' },
                        { $ref: '#/components/parameters/LimitParam' },
                        { $ref: '#/components/parameters/SearchParam' },
                        { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
                        { name: 'assignedToId', in: 'query', schema: { type: 'string' }, description: 'Filter by assigned user' },
                        { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Filter by lead source' },
                    ],
                    responses: {
                        '200': {
                            description: 'Successful response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    leads: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                                                    total: { type: 'integer' },
                                                    page: { type: 'integer' },
                                                    totalPages: { type: 'integer' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        '401': { $ref: '#/components/responses/UnauthorizedError' },
                        '429': { $ref: '#/components/responses/RateLimitError' },
                    },
                },
                post: {
                    summary: 'Create lead',
                    description: 'Create a new lead.',
                    tags: ['Leads'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LeadCreate' },
                            },
                        },
                    },
                    responses: {
                        '201': {
                            description: 'Lead created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { $ref: '#/components/schemas/Lead' },
                                        },
                                    },
                                },
                            },
                        },
                        '400': {
                            description: 'Validation error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/Error' },
                                },
                            },
                        },
                        '401': { $ref: '#/components/responses/UnauthorizedError' },
                    },
                },
            },
            '/api/v1/leads/{id}': {
                get: {
                    summary: 'Get lead by ID',
                    tags: ['Leads'],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        '200': {
                            description: 'Successful response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { $ref: '#/components/schemas/Lead' },
                                        },
                                    },
                                },
                            },
                        },
                        '404': { $ref: '#/components/responses/NotFoundError' },
                    },
                },
                put: {
                    summary: 'Update lead',
                    tags: ['Leads'],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LeadCreate' },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'Lead updated successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { $ref: '#/components/schemas/Lead' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                delete: {
                    summary: 'Delete lead',
                    tags: ['Leads'],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        '200': {
                            description: 'Lead deleted successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/v1/cases': {
                get: {
                    summary: 'List cases',
                    tags: ['Cases'],
                    parameters: [
                        { $ref: '#/components/parameters/PageParam' },
                        { $ref: '#/components/parameters/LimitParam' },
                        { name: 'status', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: {
                        '200': {
                            description: 'Successful response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    cases: { type: 'array', items: { $ref: '#/components/schemas/Case' } },
                                                    total: { type: 'integer' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/v1/webhooks': {
                get: {
                    summary: 'List webhook subscriptions',
                    tags: ['Webhooks'],
                    responses: {
                        '200': {
                            description: 'Successful response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { type: 'array', items: { $ref: '#/components/schemas/WebhookSubscription' } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                post: {
                    summary: 'Create webhook subscription',
                    tags: ['Webhooks'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/WebhookSubscriptionCreate' },
                            },
                        },
                    },
                    responses: {
                        '201': {
                            description: 'Webhook subscription created',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { $ref: '#/components/schemas/WebhookSubscription' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/v1/integrations': {
                get: {
                    summary: 'List available integrations',
                    tags: ['Integrations'],
                    parameters: [
                        { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category' },
                    ],
                    responses: {
                        '200': {
                            description: 'Successful response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { type: 'array', items: { $ref: '#/components/schemas/Integration' } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

// Helper to get available webhook events
export function getAvailableWebhookEvents(): string[] {
    return [
        'lead.created',
        'lead.updated',
        'lead.deleted',
        'lead.status_changed',
        'lead.assigned',
        'case.created',
        'case.updated',
        'case.status_changed',
        'case.assigned',
        'document.uploaded',
        'document.verified',
        'document.rejected',
        'workflow.started',
        'workflow.completed',
        'workflow.failed',
        'approval.requested',
        'approval.approved',
        'approval.rejected',
    ];
}
