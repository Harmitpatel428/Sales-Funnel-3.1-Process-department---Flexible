import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/calendar/events/[id]
 * Get a specific calendar event
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, useNextAuth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { nextAuthSession, params } = context;

        if (!nextAuthSession?.user?.id) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const user = await prisma.user.findUnique({ where: { id: nextAuthSession.user.id as string } });
        if (!user) {
            return unauthorizedResponse();
        }

        const event = await prisma.calendarEvent.findFirst({
            where: { id, tenantId: user.tenantId }
        });

        if (!event) {
            return notFoundResponse('Event');
        }

        return NextResponse.json(event);
    }
);

/**
 * PUT /api/calendar/events/[id]
 * Update a calendar event
 */
export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true, useNextAuth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { nextAuthSession, params } = context;

        if (!nextAuthSession?.user?.id) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await req.json();

        const user = await prisma.user.findUnique({ where: { id: nextAuthSession.user.id as string } });
        if (!user) {
            return unauthorizedResponse();
        }

        const existing = await prisma.calendarEvent.findFirst({
            where: { id, tenantId: user.tenantId }
        });

        if (!existing) {
            return notFoundResponse('Event');
        }

        await prisma.calendarEvent.update({
            where: { id },
            data: {
                title: body.title,
                startTime: body.startTime ? new Date(body.startTime) : undefined,
                endTime: body.endTime ? new Date(body.endTime) : undefined,
                description: body.description,
                updatedAt: new Date()
            }
        });

        return NextResponse.json({ success: true });
    }
);

/**
 * DELETE /api/calendar/events/[id]
 * Delete a calendar event
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, useNextAuth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { nextAuthSession, params } = context;

        if (!nextAuthSession?.user?.id) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const user = await prisma.user.findUnique({ where: { id: nextAuthSession.user.id as string } });
        if (!user) {
            return unauthorizedResponse();
        }

        const existing = await prisma.calendarEvent.findFirst({
            where: { id, tenantId: user.tenantId }
        });

        if (!existing) {
            return notFoundResponse('Event');
        }

        await prisma.calendarEvent.delete({ where: { id } });
        return NextResponse.json({ success: true });
    }
);
