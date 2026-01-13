"use client";

import React, { useState, useEffect } from 'react';
import { useEmail } from '@/app/context/EmailContext';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import EmailComposer from './EmailComposer';
import { ChevronDown, ChevronUp, Reply, Forward } from 'lucide-react';

interface EmailThreadViewProps {
    threadId: string;
    onClose?: () => void;
}

export default function EmailThreadView({ threadId, onClose }: EmailThreadViewProps) {
    const { fetchEmails, emails } = useEmail();
    const [threadEmails, setThreadEmails] = useState<any[]>([]);
    const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<any>(null); // Email object to reply to

    useEffect(() => {
        // Fetch specific thread emails or filter from context
        fetchEmails({ threadId });
        // Assuming fetchEmails updates the main 'emails' list. 
        // Better: create specific fetchThread method or filter locally if data is there.
        // For simplicity, we rely on context filtering.
    }, [threadId, fetchEmails]);

    useEffect(() => {
        const relevant = emails.filter(e => e.threadId === threadId || e.id === threadId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setThreadEmails(relevant);
        if (relevant.length > 0) setExpandedEmailId(relevant[relevant.length - 1].id); // Auto expand last
    }, [emails, threadId]);

    const toggleExpand = (id: string) => {
        setExpandedEmailId(prev => prev === id ? null : id);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                <h2 className="font-semibold text-lg">{threadEmails[0]?.subject || 'Conversation'}</h2>
                <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {threadEmails.map(email => (
                    <Card key={email.id} className={expandedEmailId === email.id ? 'border-primary' : ''}>
                        <CardHeader className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(email.id)}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-medium">{email.from}</div>
                                    <div className="text-sm text-gray-500">To: {email.to}</div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <div className="text-xs text-gray-500">{formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}</div>
                                    {email.status === 'SENT' && <Badge variant="outline" className="mt-1 text-xs">Sent</Badge>}
                                </div>
                            </div>
                        </CardHeader>

                        {expandedEmailId === email.id && (
                            <CardContent className="p-4 pt-0 border-t">
                                <div className="mt-4 prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: email.htmlBody || email.textBody || '' }} />
                                {email.attachments && email.attachments.length > 0 && (
                                    <div className="mt-4 pt-4 border-t">
                                        <div className="text-xs font-semibold mb-2">Attachments</div>
                                        <div className="flex gap-2">
                                            {email.attachments.map((att: any) => (
                                                <Badge key={att.id} variant="secondary">{att.fileName}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        )}

                        {expandedEmailId === email.id && (
                            <CardFooter className="p-2 bg-gray-50 flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setReplyingTo(email); }}>
                                    <Reply className="w-4 h-4 mr-1" /> Reply
                                </Button>
                                <Button size="sm" variant="ghost">
                                    <Forward className="w-4 h-4 mr-1" /> Forward
                                </Button>
                            </CardFooter>
                        )}
                    </Card>
                ))}
            </div>

            {replyingTo && (
                <div className="mt-auto border-t">
                    <EmailComposer
                        to={replyingTo.from} // Reply to sender
                        subject={`Re: ${replyingTo.subject}`}
                        leadId={replyingTo.leadId}
                        caseId={replyingTo.caseId}
                        onClose={() => setReplyingTo(null)}
                        onSent={() => setReplyingTo(null)}
                    />
                </div>
            )}
        </div>
    );
}
