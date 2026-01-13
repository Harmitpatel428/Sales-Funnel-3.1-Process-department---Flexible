"use client";

import React, { useState, useEffect } from 'react';
import { useEmail } from '@/app/context/EmailContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input'; // Assuming input component exists

export default function EmailSettingsPage() {
    const { providers, connectProvider, disconnectProvider, fetchProviders } = useEmail();
    const [authCode, setAuthCode] = useState('');
    const [activeProvider, setActiveProvider] = useState<'gmail' | 'outlook'>('gmail');

    useEffect(() => {
        // Check for code in URL (OAuth callback)
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state'); // Provider hint could be in state

        if (code) {
            // We need to know which provider triggered this. 
            // Ideally state param helps. For MVP we assume user triggered flow and remembers?
            // Or we deduce from the page we are on if we stored it in LS.
            // Simulating 'gmail' for now if specific logic missing.
            // Actually, the route `/api/email/oauth/[provider]` handles code exchange.
            // We need to call `connectProvider`. 
            // Let's assume the user selects provider or we use 'gmail' default.
            // Real implementation would have unique callback URLs like /email/settings?provider=gmail
            const provider = params.get('provider') || 'gmail'; // Assuming we appended this on redirect return

            connectProvider(provider, code, window.location.origin + window.location.pathname)
                .then(() => {
                    window.history.replaceState({}, '', window.location.pathname); // Clear code
                });
        }
    }, [connectProvider]);

    const handleConnect = async (provider: string) => {
        // 1. Get auth URL
        const res = await fetch(`/api/email/oauth/${provider}`);
        const data = await res.json();

        if (data.url) {
            window.location.href = data.url;
        } else {
            toast.error('Failed to initiate connection');
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <h1 className="text-3xl font-bold">Email Settings</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Connected Accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {providers.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-4 border rounded">
                            <div>
                                <div className="font-bold capitalize">{p.provider}</div>
                                <div className="text-gray-500">{p.email}</div>
                            </div>
                            <Button variant="destructive" onClick={() => disconnectProvider(p.id)}>Disconnect</Button>
                        </div>
                    ))}
                    {providers.length === 0 && <div className="text-gray-500">No accounts connected.</div>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Connect New Account</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                    <Button onClick={() => handleConnect('gmail')} className="bg-red-600 hover:bg-red-700">Connect Gmail</Button>
                    <Button onClick={() => handleConnect('outlook')} className="bg-blue-600 hover:bg-blue-700">Connect Outlook</Button>
                </CardContent>
            </Card>

            {/* Signature and other settings would go here */}
        </div>
    );
}
