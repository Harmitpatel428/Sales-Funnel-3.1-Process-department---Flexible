"use client";

import React, { useState, useEffect } from 'react';
import { useEmail } from '@/app/context/EmailContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash, Edit } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function EmailTemplateManager() {
    const { templates, fetchTemplates, createTemplate, isLoading } = useEmail();
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        subject: '',
        htmlBody: '',
        category: 'GENERAL'
    });

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const handleCreate = async () => {
        await createTemplate(formData);
        setIsCreating(false);
        setFormData({ name: '', subject: '', htmlBody: '', category: 'GENERAL' });
    };

    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Email Templates</h2>
                <Button onClick={() => setIsCreating(!isCreating)}>
                    {isCreating ? 'Cancel' : <><Plus className="mr-2 h-4 w-4" /> New Template</>}
                </Button>
            </div>

            {isCreating && (
                <Card>
                    <CardHeader>
                        <CardTitle>Create Template</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Name</Label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Welcome Email" />
                            </div>
                            <div>
                                <Label>Category</Label>
                                <Input value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} placeholder="e.g. FOLLOW_UP" />
                            </div>
                        </div>
                        <div>
                            <Label>Subject</Label>
                            <div className="text-xs text-gray-500 mb-1">Use {"{{variable}}"} for dynamic content.</div>
                            <Input value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} />
                        </div>
                        <div className="h-64 mb-12">
                            <Label>Body</Label>
                            <ReactQuill
                                theme="snow"
                                value={formData.htmlBody}
                                onChange={val => setFormData({ ...formData, htmlBody: val })}
                                className="h-full"
                            />
                        </div>
                        <div className="pt-8">
                            <Button onClick={handleCreate} disabled={!formData.name || !formData.subject}>Save Template</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(template => (
                    <Card key={template.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{template.name}</CardTitle>
                            {template.category && <Badge variant="secondary">{template.category}</Badge>}
                        </CardHeader>
                        <CardContent>
                            <div className="text-xs text-muted-foreground mb-2">Subject: {template.subject}</div>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                                {/* Delete logic implicit/omitted for brevity in this file unless needed */}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
