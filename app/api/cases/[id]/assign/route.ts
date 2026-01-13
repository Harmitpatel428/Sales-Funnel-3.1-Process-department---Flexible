import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';

const AssignCaseSchema = z.object({
  userId: z.string(),
  roleId: z.string().optional()
});

async function getParams(context: { params: Promise<{ id: string }> }) {
  return await context.params;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const rateLimitError = await rateLimitMiddleware(req, 30);
    if (rateLimitError) return rateLimitError;

    const { id } = await getParams(context);
    const session = await getSession();
    logRequest(req, session);
    if (!session) return unauthorizedResponse();

    if (!['ADMIN', 'PROCESS_MANAGER'].includes(session.role)) {
      return forbiddenResponse();
    }

    const body = await req.json();
    const validation = AssignCaseSchema.safeParse(body);
    if (!validation.success) return validationErrorResponse(validation.error.errors.map(e => e.message));

    const { userId, roleId } = validation.data;

    return await withTenant(session.tenantId, async () => {
      const caseItem = await prisma.case.findFirst({
        where: { caseId: id, tenantId: session.tenantId }
      });

      if (!caseItem) return notFoundResponse('Case');

      const targetUser = await prisma.user.findFirst({
        where: { id: userId, tenantId: session.tenantId }
      });

      if (!targetUser) return notFoundResponse('User');

      const updatedCase = await prisma.case.update({
        where: { caseId: id },
        data: {
          assignedProcessUserId: userId,
          assignedRole: roleId || 'PROCESS_EXECUTIVE',
          updatedAt: new Date()
        }
      });

      await prisma.auditLog.create({
        data: {
          actionType: 'CASE_ASSIGNED',
          entityType: 'case',
          entityId: id,
          description: `Case assigned to ${targetUser.name}`,
          performedById: session.userId,
          tenantId: session.tenantId
        }
      });

      return successResponse(updatedCase, "Case assigned successfully");
    });

  } catch (error) {
    return handleApiError(error);
  }
}
