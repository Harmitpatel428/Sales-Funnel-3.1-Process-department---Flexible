import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: false, checkDbHealth: true, rateLimit: 1000, logRequest: false },
    async (req: NextRequest, context) => {
        const trackingId = context.params.trackingId;

        // Fire and forget update (or await if low traffic)
        try {
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
        } catch (error) {
            console.error('Error tracking email open:', error);
            // Continue to return pixel
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
);

