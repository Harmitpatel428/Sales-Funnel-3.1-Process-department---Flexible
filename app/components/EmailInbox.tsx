"use client";

import React, { useState, useEffect } from 'react';
import { useEmail } from '@/app/context/EmailContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, RefreshCw, PenSquare, Search } from 'lucide-react';
import EmailThreadView from './EmailThreadView';
import EmailComposer from './EmailComposer';
import { format } from 'date-fns';

export default function EmailInbox() {
    const { emails, fetchEmails, syncEmails, isLoading } = useEmail();
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [isComposing, setIsComposing] = useState(false);
    const [search, setSearch] = useState('');
    const [folder, setFolder] = useState('inbox'); // inbox, sent, draft

    useEffect(() => {
        // Initial fetch logic based on folder logic if backend supported 'folder' parameter
        // Assuming fetchEmails handles basic filtering implicitly or we filter client side for MVP
        fetchEmails();
        // To implement folder switching properly, backend API needs to support folder/status filtering
        // For now, we will sort/filter client side based on 'direction' and 'status'
    }, [fetchEmails]); // Re-fetch on mount

    const filteredEmails = emails.filter(e => {
        const matchesSearch = e.subject.toLowerCase().includes(search.toLowerCase()) || e.from.toLowerCase().includes(search.toLowerCase());
        const matchesFolder = folder === 'inbox' ? e.direction === 'INBOUND' :
            folder === 'sent' ? (e.direction === 'OUTBOUND' && e.status === 'SENT') :
                folder === 'draft' ? e.status === 'DRAFT' : true;
        return matchesSearch && matchesFolder;
    });

    return (
        <div className="flex h-[calc(100vh-100px)] border rounded-lg bg-white overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 border-r bg-gray-50 flex flex-col p-4 space-y-2">
                <Button onClick={() => setIsComposing(true)} className="w-full mb-4">
                    <PenSquare className="mr-2 h-4 w-4" /> Compose
                </Button>
                <Button variant={folder === 'inbox' ? 'secondary' : 'ghost'} onClick={() => setFolder('inbox')} className="justify-start">Inbox</Button>
                <Button variant={folder === 'sent' ? 'secondary' : 'ghost'} onClick={() => setFolder('sent')} className="justify-start">Sent</Button>
                <Button variant={folder === 'draft' ? 'secondary' : 'ghost'} onClick={() => setFolder('draft')} className="justify-start">Drafts</Button>
            </div>

            {/* List */}
            <div className={`w-1/3 flex flex-col border-r ${selectedThreadId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b space-y-2">
                    <div className="flex justify-between items-center">
                        <h2 className="font-semibold text-lg capitalize">{folder}</h2>
                        <Button variant="ghost" size="icon" onClick={syncEmails} disabled={isLoading}>
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="Search emails..."
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredEmails.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No emails found</div>
                    ) : (
                        filteredEmails.map(email => (
                            <div
                                key={email.id}
                                onClick={() => setSelectedThreadId(email.threadId || email.id)}
                                className={`p-4 border-b cursor-pointer hover:bg-blue-50 transition-colors ${selectedThreadId === (email.threadId || email.id) ? 'bg-blue-50 border-l-4 border-l-primary' : 'border-l-4 border-l-transparent'}`}
                            >
                                <div className="flex justify-between mb-1">
                                    <span className="font-medium truncate max-w-[70%]">{folder === 'sent' ? email.to : email.from}</span>
                                    <span className="text-xs text-gray-500 whitespace-nowrap">{format(new Date(email.createdAt), 'MMM d, h:mm a')}</span>
                                </div>
                                <div className="font-medium text-sm truncate text-gray-800 mb-1">{email.subject}</div>
                                <div className="text-xs text-gray-500 truncate">{email.textBody || email.htmlBody?.replace(/<[^>]+>/g, '') || 'No content...'}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Detail View */}
            <div className={`flex-1 flex flex-col ${!selectedThreadId ? 'hidden md:flex items-center justify-center bg-gray-50' : ''}`}>
                {isComposing ? (
                    <EmailComposer onClose={() => setIsComposing(false)} onSent={() => { setIsComposing(false); fetchEmails(); }} />
                ) : selectedThreadId ? (
                    <EmailThreadView threadId={selectedThreadId} onClose={() => setSelectedThreadId(null)} />
                ) : (
                    <div className="text-gray-400">Select an email to view conversation</div>
                )}
            </div>
        </div>
    );
}
