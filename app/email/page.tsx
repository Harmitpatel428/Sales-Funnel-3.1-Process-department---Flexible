"use client";

import React from 'react';
import EmailInbox from '@/app/components/EmailInbox';

export default function EmailPage() {
    return (
        <div className="h-screen bg-gray-100 p-4">
            <EmailInbox />
        </div>
    );
}
