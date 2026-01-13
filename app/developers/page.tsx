'use client';

import Link from 'next/link';

export default function DeveloperPortalPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-12 px-4">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">Developer Portal</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Build powerful integrations with our API. Access documentation, manage API keys,
                        and connect your applications.
                    </p>
                </div>

                {/* Quick Links */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
                        <div className="text-4xl mb-4">📖</div>
                        <h2 className="text-xl font-semibold mb-2">API Documentation</h2>
                        <p className="text-gray-600 mb-4">
                            Explore our REST API with interactive documentation and examples.
                        </p>
                        <Link
                            href="/api/docs"
                            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                        >
                            View API Docs
                        </Link>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
                        <div className="text-4xl mb-4">🔑</div>
                        <h2 className="text-xl font-semibold mb-2">API Keys</h2>
                        <p className="text-gray-600 mb-4">
                            Generate and manage API keys for authentication.
                        </p>
                        <Link
                            href="/developers/api-keys"
                            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                        >
                            Manage Keys
                        </Link>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
                        <div className="text-4xl mb-4">🔔</div>
                        <h2 className="text-xl font-semibold mb-2">Webhooks</h2>
                        <p className="text-gray-600 mb-4">
                            Configure webhooks for real-time event notifications.
                        </p>
                        <Link
                            href="/developers/webhooks"
                            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                        >
                            Setup Webhooks
                        </Link>
                    </div>
                </div>

                {/* Quick Start */}
                <div className="bg-white rounded-lg shadow-sm p-8 mb-12">
                    <h2 className="text-2xl font-bold mb-6">Quick Start</h2>

                    <div className="space-y-6">
                        <div>
                            <h3 className="font-semibold text-lg mb-2">1. Get your API Key</h3>
                            <p className="text-gray-600 mb-2">
                                Generate an API key from the <Link href="/developers/api-keys" className="text-blue-600 hover:underline">API Keys</Link> page.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-2">2. Make your first request</h3>
                            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                                <pre className="text-sm text-green-400">
                                    {`curl -X GET "https://api.example.com/api/v1/leads" \\
  -H "X-API-Key: sk_live_your_api_key_here" \\
  -H "Content-Type: application/json"`}
                                </pre>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-2">3. Create a lead</h3>
                            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                                <pre className="text-sm text-green-400">
                                    {`curl -X POST "https://api.example.com/api/v1/leads" \\
  -H "X-API-Key: sk_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientName": "John Doe",
    "email": "john@example.com",
    "company": "Acme Corp",
    "status": "NEW"
  }'`}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SDKs */}
                <div className="bg-white rounded-lg shadow-sm p-8 mb-12">
                    <h2 className="text-2xl font-bold mb-6">SDKs & Libraries</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-lg p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">⚡</span>
                                <h3 className="font-semibold">JavaScript / TypeScript</h3>
                            </div>
                            <div className="bg-gray-100 rounded p-2 mb-3">
                                <code className="text-sm">npm install @sales-funnel/crm-sdk</code>
                            </div>
                            <a
                                href="https://github.com/example/crm-sdk-js"
                                className="text-blue-600 hover:underline text-sm"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View on GitHub →
                            </a>
                        </div>

                        <div className="border rounded-lg p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">🐍</span>
                                <h3 className="font-semibold">Python</h3>
                            </div>
                            <div className="bg-gray-100 rounded p-2 mb-3">
                                <code className="text-sm">pip install crm-sdk</code>
                            </div>
                            <a
                                href="https://github.com/example/crm-sdk-python"
                                className="text-blue-600 hover:underline text-sm"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View on GitHub →
                            </a>
                        </div>
                    </div>
                </div>

                {/* API Scopes */}
                <div className="bg-white rounded-lg shadow-sm p-8 mb-12">
                    <h2 className="text-2xl font-bold mb-6">API Scopes</h2>
                    <p className="text-gray-600 mb-4">
                        When creating an API key, you can limit its access by selecting specific scopes:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            { scope: 'leads:read', desc: 'Read access to leads' },
                            { scope: 'leads:write', desc: 'Create and update leads' },
                            { scope: 'leads:delete', desc: 'Delete leads' },
                            { scope: 'cases:read', desc: 'Read access to cases' },
                            { scope: 'cases:write', desc: 'Create and update cases' },
                            { scope: 'documents:read', desc: 'Read access to documents' },
                            { scope: 'documents:write', desc: 'Upload and update documents' },
                            { scope: 'webhooks:read', desc: 'Read webhook subscriptions' },
                            { scope: 'webhooks:write', desc: 'Manage webhook subscriptions' },
                        ].map(({ scope, desc }) => (
                            <div key={scope} className="bg-gray-50 rounded p-3">
                                <code className="text-sm font-mono text-blue-600">{scope}</code>
                                <p className="text-sm text-gray-600 mt-1">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Rate Limits */}
                <div className="bg-white rounded-lg shadow-sm p-8">
                    <h2 className="text-2xl font-bold mb-6">Rate Limits</h2>

                    <div className="space-y-4">
                        <p className="text-gray-600">
                            API requests are rate-limited to ensure fair usage. Default limits:
                        </p>

                        <ul className="list-disc list-inside space-y-2 text-gray-600">
                            <li><strong>1,000 requests per hour</strong> per API key (default)</li>
                            <li>Rate limits can be customized per API key</li>
                            <li>Rate limit headers are included in every response</li>
                        </ul>

                        <div className="bg-gray-100 rounded p-4 mt-4">
                            <p className="text-sm font-medium mb-2">Response Headers:</p>
                            <pre className="text-sm text-gray-700">
                                {`X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 2024-01-01T12:00:00Z`}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
