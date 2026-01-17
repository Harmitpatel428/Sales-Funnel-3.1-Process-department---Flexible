import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { withTenant } from '@/lib/tenant';
import { ActivitySchema, validateRequest } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) return unauthorizedResponse();

        return await withTenant(session.tenantId, async () => {
            const lead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId },
                select: { activities: true }
            });

            if (!lead) return notFoundResponse('Lead');

            const activities = lead.activities ? JSON.parse(lead.activities) : [];
            return successResponse(activities);
        });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const { id } = await getParams(context);
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        const body = await req.json();
        // Activity payload might be just the activity object, but we need to ensure structure
        // Use ActivitySchema, but maybe relax ID as we generate it?

        const activityData = {
            ...body,
            id: body.id || `act_${Date.now()}`,
            timestamp: body.timestamp || new Date(),
            performedBy: body.performedBy || session.userId // fallback to current user
        };

        // Simple validation for required fields if needed, relying on frontend or Schema
        // const validation = validateRequest(ActivitySchema, activityData); -- ActivitySchema is strict, might need partial handling or construction

        return await withTenant(session.tenantId, async () => {
            const lead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId }
            });

            if (!lead) return notFoundResponse('Lead');

            const currentActivities = lead.activities ? JSON.parse(lead.activities) : [];
            const newActivities = [activityData, ...currentActivities]; // Prepend newest

            await prisma.lead.update({
                where: { id },
                data: {
                    activities: JSON.stringify(newActivities),
                    lastActivityDate: new Date(activityData.timestamp)
                }
            });

            return successResponse(activityData, "Activity added");
        });
    } catch (error) {
        return handleApiError(error);
    }
}
