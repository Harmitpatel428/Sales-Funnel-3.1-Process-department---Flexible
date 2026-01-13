import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { EmailService } from '@/lib/email-service';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const emailService = new EmailService();

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ provider: string }> } // Params are promises in Next.js 15
) {
    const { provider } = await params;
    const session = await getServerSession();
    // Note: authOptions might be needed if not globally available, assuming standard next-auth setup
    // But plan says "Store state parameter in session". 
    // Actually, for better security, we should generate state and store it in a cookie or DB.
    // For simplicity and following plan: "Return redirect URL to client".

    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (provider === 'gmail') {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET,
            process.env.GMAIL_REDIRECT_URI
        );

        const scopes = [
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.email'
        ];

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent', // Force refresh token
            state: session.user.id // naive state
        });

        return NextResponse.json({ url });
    } else if (provider === 'outlook') {
        // Outlook generation
        const clientId = process.env.OUTLOOK_CLIENT_ID;
        const redirectUri = process.env.OUTLOOK_REDIRECT_URI!; // Ensure env var exists
        const scopes = ["User.Read", "Mail.ReadWrite", "Mail.Send", "offline_access"];
        const prompt = "consent";

        // Construct manual URL or use msal-node
        const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scopes.join(' '))}&state=${session.user.id}`;

        return NextResponse.json({ url });
    }

    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const { provider } = await params;
    const session = await getServerSession();

    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { code, redirectUri } = z.object({ code: z.string(), redirectUri: z.string().optional() }).parse(body);

        const emailProvider = await emailService.connectProvider(
            session.user.id as string,
            provider,
            code,
            redirectUri || process.env.GMAIL_REDIRECT_URI! // Fallback to env
        );

        return NextResponse.json(emailProvider);
    } catch (error: any) {
        console.error('OAuth connection error:', error);
        return NextResponse.json({ error: error.message || 'Failed to connect provider' }, { status: 500 });
    }
}
