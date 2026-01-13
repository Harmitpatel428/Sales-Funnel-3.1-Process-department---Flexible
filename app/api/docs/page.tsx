'use client';

import { useEffect, useState } from 'react';

// Simple in-browser Swagger UI implementation
export default function ApiDocsPage() {
    const [spec, setSpec] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetch('/api/docs/openapi.json')
            .then(res => res.json())
            .then(data => setSpec(data))
            .catch(err => setError(err.message));
    }, []);

    const togglePath = (path: string) => {
        setExpandedPaths(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const methodColors: Record<string, string> = {
        get: 'bg-blue-500',
        post: 'bg-green-500',
        put: 'bg-orange-500',
        patch: 'bg-yellow-500',
        delete: 'bg-red-500',
    };

    if (error) {
        return (
            <div className="container mx-auto py-8">
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    Error loading API documentation: {error}
                </div>
            </div>
        );
    }

    if (!spec) {
        return (
            <div className="container mx-auto py-8">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-2">Loading API documentation...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-8 px-4">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">{spec.info.title}</h1>
                    <p className="text-gray-600 mt-2">Version: {spec.info.version}</p>
                    <div className="mt-4 prose max-w-none">
                        <p className="text-gray-700 whitespace-pre-wrap">{spec.info.description}</p>
                    </div>
                </div>

                {/* Servers */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Servers</h2>
                    <div className="space-y-2">
                        {spec.servers?.map((server: any, index: number) => (
                            <div key={index} className="flex items-center gap-2">
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">{server.url}</code>
                                <span className="text-gray-500 text-sm">- {server.description}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Authentication */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Authentication</h2>
                    <div className="space-y-4">
                        {Object.entries(spec.components?.securitySchemes || {}).map(([name, scheme]: [string, any]) => (
                            <div key={name} className="border rounded p-4">
                                <h3 className="font-medium">{name}</h3>
                                <p className="text-gray-600 text-sm mt-1">Type: {scheme.type}</p>
                                {scheme.in && <p className="text-gray-600 text-sm">In: {scheme.in}</p>}
                                {scheme.name && <p className="text-gray-600 text-sm">Name: {scheme.name}</p>}
                                {scheme.description && <p className="text-gray-500 text-sm mt-2">{scheme.description}</p>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tags */}
                {spec.tags && spec.tags.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">API Categories</h2>
                        <div className="flex flex-wrap gap-2">
                            {spec.tags.map((tag: any) => (
                                <span key={tag.name} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                    {tag.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Endpoints */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-xl font-semibold mb-4">Endpoints</h2>
                    <div className="space-y-2">
                        {Object.entries(spec.paths || {}).map(([path, methods]: [string, any]) => (
                            <div key={path} className="border rounded">
                                {Object.entries(methods).map(([method, operation]: [string, any]) => {
                                    const key = `${method}-${path}`;
                                    const isExpanded = expandedPaths[key];

                                    return (
                                        <div key={key} className="border-b last:border-b-0">
                                            <button
                                                onClick={() => togglePath(key)}
                                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
                                            >
                                                <span className={`${methodColors[method]} text-white text-xs font-bold px-2 py-1 rounded uppercase min-w-[60px] text-center`}>
                                                    {method}
                                                </span>
                                                <code className="text-gray-800 font-mono text-sm">{path}</code>
                                                <span className="text-gray-500 text-sm ml-auto">{operation.summary}</span>
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {isExpanded && (
                                                <div className="p-4 bg-gray-50 border-t">
                                                    {operation.description && (
                                                        <p className="text-gray-700 mb-4">{operation.description}</p>
                                                    )}

                                                    {operation.tags && (
                                                        <div className="mb-4">
                                                            <span className="text-sm font-medium text-gray-600">Tags: </span>
                                                            {operation.tags.map((tag: string) => (
                                                                <span key={tag} className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs ml-1">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {operation.parameters && operation.parameters.length > 0 && (
                                                        <div className="mb-4">
                                                            <h4 className="font-medium mb-2">Parameters</h4>
                                                            <table className="w-full text-sm">
                                                                <thead className="bg-gray-100">
                                                                    <tr>
                                                                        <th className="text-left p-2">Name</th>
                                                                        <th className="text-left p-2">In</th>
                                                                        <th className="text-left p-2">Type</th>
                                                                        <th className="text-left p-2">Required</th>
                                                                        <th className="text-left p-2">Description</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {operation.parameters.map((param: any, idx: number) => {
                                                                        const resolvedParam = param.$ref
                                                                            ? spec.components?.parameters?.[param.$ref.split('/').pop()]
                                                                            : param;
                                                                        return (
                                                                            <tr key={idx} className="border-b">
                                                                                <td className="p-2 font-mono">{resolvedParam?.name}</td>
                                                                                <td className="p-2">{resolvedParam?.in}</td>
                                                                                <td className="p-2">{resolvedParam?.schema?.type}</td>
                                                                                <td className="p-2">{resolvedParam?.required ? 'Yes' : 'No'}</td>
                                                                                <td className="p-2 text-gray-600">{resolvedParam?.description}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}

                                                    {operation.requestBody && (
                                                        <div className="mb-4">
                                                            <h4 className="font-medium mb-2">Request Body</h4>
                                                            <div className="bg-gray-100 p-3 rounded">
                                                                <code className="text-sm">
                                                                    {JSON.stringify(
                                                                        operation.requestBody.content?.['application/json']?.schema,
                                                                        null,
                                                                        2
                                                                    )}
                                                                </code>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {operation.responses && (
                                                        <div>
                                                            <h4 className="font-medium mb-2">Responses</h4>
                                                            <div className="space-y-2">
                                                                {Object.entries(operation.responses).map(([code, response]: [string, any]) => (
                                                                    <div key={code} className="flex items-start gap-2">
                                                                        <span className={`font-mono text-sm px-2 py-0.5 rounded ${code.startsWith('2') ? 'bg-green-100 text-green-800' :
                                                                                code.startsWith('4') ? 'bg-yellow-100 text-yellow-800' :
                                                                                    code.startsWith('5') ? 'bg-red-100 text-red-800' :
                                                                                        'bg-gray-100 text-gray-800'
                                                                            }`}>
                                                                            {code}
                                                                        </span>
                                                                        <span className="text-gray-600 text-sm">
                                                                            {response.description || response.$ref?.split('/').pop()}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Schemas */}
                <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
                    <h2 className="text-xl font-semibold mb-4">Schemas</h2>
                    <div className="space-y-4">
                        {Object.entries(spec.components?.schemas || {}).map(([name, schema]: [string, any]) => (
                            <div key={name} className="border rounded">
                                <button
                                    onClick={() => togglePath(`schema-${name}`)}
                                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                                >
                                    <span className="font-mono font-medium">{name}</span>
                                    <svg
                                        className={`w-4 h-4 transition-transform ${expandedPaths[`schema-${name}`] ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {expandedPaths[`schema-${name}`] && (
                                    <div className="p-4 bg-gray-50 border-t">
                                        <pre className="text-sm overflow-x-auto">
                                            {JSON.stringify(schema, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
