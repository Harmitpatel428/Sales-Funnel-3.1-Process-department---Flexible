import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { successResponse, unauthorizedResponse, handleApiError } from '@/lib/api/response-helpers';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return unauthorizedResponse();

        const permissions = await getUserPermissions(session.userId);

        return successResponse({
            userId: session.userId,
            username: session.username,
            role: session.role,
            permissions
        });
    } catch (error) {
        return handleApiError(error);
    }
}
