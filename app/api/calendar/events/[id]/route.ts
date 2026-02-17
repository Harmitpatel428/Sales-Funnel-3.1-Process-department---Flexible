import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@/app/types/permissions';
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
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.CALENDAR_VIEW, PERMISSIONS.CALENDAR_VIEW_OWN],
        requireAll: false
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const event = await prisma.calendarEvent.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!event) {
            return notFoundResponse('Event');
        }

        return NextResponse.json({ success: true, data: { event } });
    }
);

/**
 * PUT /api/calendar/events/[id]
 * Update a calendar event
 */
export const PUT = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.CALENDAR_EDIT]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await req.json();

        const existing = await prisma.calendarEvent.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!existing) {
            return notFoundResponse('Event');
        }

        const event = await prisma.calendarEvent.update({
            where: { id },
            data: {
                title: body.title,
                startTime: body.startTime ? new Date(body.startTime) : undefined,
                endTime: body.endTime ? new Date(body.endTime) : undefined,
                description: body.description,
                updatedAt: new Date()
            }
        });

        return NextResponse.json({ success: true, data: { event } });
    }
);

/**
 * DELETE /api/calendar/events/[id]
 * Delete a calendar event
 */
export const DELETE = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.CALENDAR_DELETE]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const existing = await prisma.calendarEvent.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!existing) {
            return notFoundResponse('Event');
        }

        await prisma.calendarEvent.delete({ where: { id } });
        return NextResponse.json({ success: true, message: 'Event deleted' });
    }
);
