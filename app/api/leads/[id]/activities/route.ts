import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { ActivitySchema, validateRequest } from '@/lib/validation/schemas';
import { successResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';
import { requirePermissions, getRecordLevelFilter } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { emitLeadUpdated } from '@/lib/websocket/server';

// Helper to get params
async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

const getHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    // Permission check
    const permissionError = await requirePermissions(
        [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
        false
    )(req);
    if (permissionError) return permissionError;

    // Record level filter
    const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'view');

    return await withTenant(session.tenantId, async () => {
        const lead = await prisma.lead.findFirst({
            where: {
                id,
                tenantId: session.tenantId,
                ...recordFilter
            },
            select: { activities: true }
        });

        if (!lead) return notFoundResponse('Lead');

        const activities = lead.activities ? JSON.parse(lead.activities) : [];
        return successResponse(activities);
    });
};

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 100 },
        (req, ctx) => getHandler(req, ctx, id)
    )(req);
}

const postHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    // Permission check
    const permissionError = await requirePermissions(
        [PERMISSIONS.LEADS_EDIT_OWN, PERMISSIONS.LEADS_EDIT_ASSIGNED, PERMISSIONS.LEADS_EDIT_ALL],
        false
    )(req);
    if (permissionError) return permissionError;

    // Record level filter for edit permissions
    const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'edit');

    const body = await req.json();

    const activityData = {
        ...body,
        id: body.id || `act_${Date.now()}`,
        timestamp: body.timestamp || new Date(),
        performedBy: body.performedBy || session.userId // fallback to current user
    };

    // Optional: Validate activityData pattern if Schema allows partial
    // const validation = validateRequest(ActivitySchema, activityData);

    return await withTenant(session.tenantId, async () => {
        const lead = await prisma.lead.findFirst({
            where: {
                id,
                tenantId: session.tenantId,
                ...recordFilter
            }
        });

        if (!lead) return notFoundResponse('Lead');

        const currentActivities = lead.activities ? JSON.parse(lead.activities) : [];
        const newActivities = [activityData, ...currentActivities]; // Prepend newest

        const updatedLead = await prisma.lead.update({
            where: { id },
            data: {
                activities: JSON.stringify(newActivities),
                lastActivityDate: new Date(activityData.timestamp)
            }
        });

        // WebSocket Broadcast for Lead Update (since activities changed)
        try {
            await emitLeadUpdated(session.tenantId, updatedLead);
        } catch (wsError) {
            console.error('[WebSocket] Lead update broadcast for activity failed:', wsError);
        }

        return successResponse(activityData, "Activity added");
    });
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 30 },
        (req, ctx) => postHandler(req, ctx, id)
    )(req);
}
