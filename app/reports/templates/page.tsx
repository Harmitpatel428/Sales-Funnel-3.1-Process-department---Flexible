"use client";

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Filter, Trash2, Copy, Share2, Edit } from 'lucide-react';

interface Template {
    id: string;
    name: string;
    description?: string;
    category: string;
    isPublic: boolean;
    createdBy: { id: string; name: string };
    createdAt: string;
    updatedAt: string;
}

const CATEGORIES = ['Sales', 'Operations', 'Executive', 'Custom'];

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchTemplates = async () => {
        setIsLoading(true);
        try {
            const url = categoryFilter ? `/api/reports/templates?category=${categoryFilter}` : '/api/reports/templates';
            const response = await fetch(url);
            const result = await response.json();
            if (result.success) setTemplates(result.data.templates);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchTemplates(); }, [categoryFilter]);

    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this template?')) return;
        try {
            await fetch(`/api/reports/templates?id=${id}`, { method: 'DELETE' });
            fetchTemplates();
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    const handleDuplicate = async (template: Template) => {
        try {
            await fetch('/api/reports/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `${template.name} (Copy)`,
                    description: template.description,
                    category: template.category,
                    config: { dataSource: 'leads', fields: [], filters: [], sorts: [], chartType: 'TABLE', limit: 1000 },
                    isPublic: false,
                    sharedWith: []
                })
            });
            fetchTemplates();
        } catch (error) {
            console.error('Failed to duplicate:', error);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Report Templates</h1>
                <p className="text-slate-500 mt-1">Save and reuse report configurations</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search templates..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5 text-slate-400" />
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                            <option value="">All Categories</option>
                            {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <button onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        <Plus className="w-4 h-4" />New Template
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map(template => (
                    <div key={template.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-2 bg-indigo-50 rounded-lg"><FileText className="w-6 h-6 text-indigo-600" /></div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${template.category === 'Sales' ? 'bg-emerald-100 text-emerald-800' :
                                    template.category === 'Operations' ? 'bg-blue-100 text-blue-800' :
                                        template.category === 'Executive' ? 'bg-purple-100 text-purple-800' :
                                            'bg-slate-100 text-slate-800'
                                }`}>{template.category}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">{template.name}</h3>
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2">{template.description || 'No description'}</p>
                        <div className="flex items-center justify-between text-sm text-slate-500">
                            <span>By {template.createdBy.name}</span>
                            {template.isPublic && <span className="text-indigo-600">Public</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                            <button className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                                <Edit className="w-4 h-4" />Edit
                            </button>
                            <button onClick={() => handleDuplicate(template)}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                                <Copy className="w-4 h-4" />Copy
                            </button>
                            <button onClick={() => handleDelete(template.id)}
                                className="flex items-center justify-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                    <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900">No templates found</h3>
                    <p className="text-slate-500">Create your first template to get started</p>
                </div>
            )}
        </div>
    );
}
