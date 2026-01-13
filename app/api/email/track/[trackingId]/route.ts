import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ trackingId: string }> }
) {
    const { trackingId } = await params;

    // Fire and forget update (or await if low traffic)
    // Check if trackingId exists
    const email = await prisma.email.findUnique({ where: { trackingPixelId: trackingId } });

    if (email && !email.openedAt) {
        await prisma.email.update({
            where: { id: email.id },
            data: {
                openedAt: new Date(),
                openCount: { increment: 1 }
            }
        });
    } else if (email) {
        await prisma.email.update({
            where: { id: email.id },
            data: { openCount: { increment: 1 } }
        });
    }

    // Return transparent 1x1 GIF
    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );

    return new NextResponse(pixel, {
        headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
}
