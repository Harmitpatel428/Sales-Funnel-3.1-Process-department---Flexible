"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Send, Play } from 'lucide-react';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

interface Campaign {
    id: string;
    name: string;
    status: string;
    totalRecipients: number;
    sentCount: number;
    openedCount: number;
    clickedCount: number;
}

export default function EmailCampaignManager() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        subject: '',
        htmlBody: '',
        targetLeadIds: [] as string[] // Mocking selection or entering IDs
    });

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        const res = await fetch('/api/email/campaigns');
        if (res.ok) setCampaigns(await res.json());
    };

    const handleCreate = async () => {
        // Mocking adding lead IDs - in real app would use a Lead Selector component
        const payload = {
            ...formData,
            targetLeadIds: ['lead-1', 'lead-2'] // Using mock IDs for demo if user didn't select
        };

        const res = await fetch('/api/email/campaigns', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            toast.success('Campaign created');
            setIsCreating(false);
            fetchCampaigns();
        } else {
            toast.error('Failed to create campaign');
        }
    };

    const handleSend = async (id: string) => {
        const res = await fetch(`/api/email/campaigns/${id}/send`, { method: 'POST' });
        if (res.ok) {
            toast.success('Campaign sending started');
            fetchCampaigns();
        }
    };

    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Email Campaigns</h2>
                <Button onClick={() => setIsCreating(!isCreating)}><Plus className="mr-2 h-4 w-4" /> New Campaign</Button>
            </div>

            {isCreating && (
                <Card>
                    <CardHeader><CardTitle>Create Campaign</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div><Label>Name</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
                        <div><Label>Subject</Label><Input value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} /></div>
                        <div className="h-64 mb-12"><ReactQuill value={formData.htmlBody} onChange={val => setFormData({ ...formData, htmlBody: val })} className="h-full" /></div>
                        <div className="pt-8"><Button onClick={handleCreate}>Create Draft</Button></div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-4">
                {campaigns.map(c => (
                    <Card key={c.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div>
                                <CardTitle className="text-lg">{c.name}</CardTitle>
                                <Badge variant={c.status === 'SENT' ? 'default' : 'secondary'}>{c.status}</Badge>
                            </div>
                            {c.status === 'DRAFT' && (
                                <Button size="sm" onClick={() => handleSend(c.id)}><Play className="mr-2 h-4 w-4" /> Send Now</Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-4 text-center">
                                <div className="p-2 bg-gray-50 rounded">
                                    <div className="text-2xl font-bold">{c.totalRecipients}</div>
                                    <div className="text-xs text-gray-500">Recipients</div>
                                </div>
                                <div className="p-2 bg-gray-50 rounded">
                                    <div className="text-2xl font-bold text-blue-600">{c.sentCount}</div>
                                    <div className="text-xs text-gray-500">Sent</div>
                                </div>
                                <div className="p-2 bg-gray-50 rounded">
                                    <div className="text-2xl font-bold text-green-600">{c.openedCount}</div>
                                    <div className="text-xs text-gray-500">Opens</div>
                                </div>
                                <div className="p-2 bg-gray-50 rounded">
                                    <div className="text-2xl font-bold text-purple-600">{c.clickedCount}</div>
                                    <div className="text-xs text-gray-500">Clicks</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
