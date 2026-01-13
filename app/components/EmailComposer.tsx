"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useEmail } from '@/app/context/EmailContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import 'react-quill/dist/quill.snow.css';

// Dynamic import for ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

interface EmailComposerProps {
    to?: string;
    subject?: string;
    leadId?: string;
    caseId?: string;
    onClose?: () => void;
    onSent?: () => void;
}

export default function EmailComposer({ to, subject, leadId, caseId, onClose, onSent }: EmailComposerProps) {
    const { sendEmail, templates, fetchTemplates, providers } = useEmail();
    const [formData, setFormData] = useState({
        to: to || '',
        subject: subject || '',
        htmlBody: '',
        providerId: ''
    });
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        fetchTemplates();
        // Set default provider if exists logic could go here
    }, [fetchTemplates]);

    const handleSend = async () => {
        try {
            setIsSending(true);
            await sendEmail({
                ...formData,
                leadId,
                caseId
            });
            if (onSent) onSent();
            if (onClose) onClose();
        } catch (error) {
            // Toast handled in context
        } finally {
            setIsSending(false);
        }
    };

    const applyTemplate = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setFormData(prev => ({
                ...prev,
                subject: template.subject, // Optional: overwrite subject?
                htmlBody: template.htmlBody // Basic replace, variables not processed here yet (needs logic)
            }));
            // If we had variable replacement logic, it would go here or in a helper
        }
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow-lg max-w-2xl w-full">
            <h2 className="text-xl font-bold mb-4">Compose Email</h2>

            <div className="space-y-4">
                <div>
                    <Label htmlFor="provider">From</Label>
                    <Select onValueChange={(val) => setFormData({ ...formData, providerId: val })}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Email Provider" />
                        </SelectTrigger>
                        <SelectContent>
                            {providers.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.email} ({p.provider})</SelectItem>
                            ))}
                            {providers.length === 0 && <SelectItem value="default" disabled>No providers connected</SelectItem>}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="to">To</Label>
                    <Input
                        id="to"
                        value={formData.to}
                        onChange={e => setFormData({ ...formData, to: e.target.value })}
                        placeholder="recipient@example.com"
                    />
                </div>

                <div>
                    <Label htmlFor="template">Template</Label>
                    <Select onValueChange={applyTemplate}>
                        <SelectTrigger>
                            <SelectValue placeholder="Load Template" />
                        </SelectTrigger>
                        <SelectContent>
                            {templates.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                        id="subject"
                        value={formData.subject}
                        onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    />
                </div>

                <div className="h-64 mb-4">
                    <ReactQuill
                        theme="snow"
                        value={formData.htmlBody}
                        onChange={(val) => setFormData({ ...formData, htmlBody: val })}
                        className="h-full"
                    />
                </div>

                <div className="flex justify-end gap-2 mt-8 pt-4">
                    <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
                    <Button onClick={handleSend} disabled={isSending}>
                        {isSending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                        Send Email
                    </Button>
                </div>
            </div>
        </div>
    );
}
