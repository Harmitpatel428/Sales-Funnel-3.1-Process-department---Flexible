import { NextRequest } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { successResponse, unauthorizedResponse, handleApiError } from '@/lib/api/response-helpers';

export async function GET(req: NextRequest) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
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
