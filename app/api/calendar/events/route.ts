import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import ical from 'ical-generator';
import { z } from 'zod';
import { PERMISSIONS } from '@/app/types/permissions';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

const createEventSchema = z.object({
    title: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    attendees: z.array(z.string()).optional(), // Emails
    leadId: z.string().optional(),
    caseId: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional()
});

/**
 * GET /api/calendar/events
 * List calendar events
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.CALENDAR_VIEW, PERMISSIONS.CALENDAR_VIEW_OWN],
        requireAll: false
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const startStr = searchParams.get('startDate');
        const endStr = searchParams.get('endDate');
        const leadId = searchParams.get('leadId');
        const caseId = searchParams.get('caseId');

        const where: any = { tenantId: session.tenantId };

        if (startStr && endStr) {
            where.startTime = { gte: new Date(startStr), lte: new Date(endStr) };
        }
        if (leadId) where.leadId = leadId;
        if (caseId) where.caseId = caseId;

        const events = await prisma.calendarEvent.findMany({
            where,
            orderBy: { startTime: 'asc' },
            include: { organizer: { select: { name: true, email: true } } }
        });

        return NextResponse.json({ success: true, data: { events } });
    }
);

/**
 * POST /api/calendar/events
 * Create a calendar event
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.CALENDAR_CREATE]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const result = createEventSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(
                result.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                    code: e.code
                }))
            );
        }

        const data = result.data;

        const event = await prisma.calendarEvent.create({
            data: {
                title: data.title,
                startTime: new Date(data.startTime),
                endTime: new Date(data.endTime),
                organizerId: session.userId,
                tenantId: session.tenantId!,
                leadId: data.leadId,
                caseId: data.caseId,
                description: data.description,
                location: data.location,
                attendees: JSON.stringify(data.attendees || [])
            }
        });

        // Generate iCal (logic only, not sending here to save space/complexity for this step)
        // const calendar = ical({ name: 'Meeting' });
        // calendar.createEvent({ start: event.startTime, end: event.endTime, summary: event.title });
        // In real app, we'd email this ical content or sync to provider.

        return NextResponse.json({ success: true, data: { event } }, { status: 201 });
    }
);
