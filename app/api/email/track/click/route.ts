import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { parseTrackedLink } from '@/lib/email-tracking';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const emailId = searchParams.get('emailId');

    if (!url || !emailId) {
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/error?code=invalid_link`);
    }

    try {
        // Decrypt URL
        const originalUrl = parseTrackedLink(url);

        // Update stats
        await prisma.email.update({
            where: { id: emailId },
            data: {
                clickedAt: new Date(),
                clickCount: { increment: 1 }
                // Could also log distinct link clicks in trackedLinks JSON
            }
        });

        return NextResponse.redirect(originalUrl);
    } catch (error) {
        console.error("Link tracking error:", error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/error?code=tracking_failed`);
    }
}
