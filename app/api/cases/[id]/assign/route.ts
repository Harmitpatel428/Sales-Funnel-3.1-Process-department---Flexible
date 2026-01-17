import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { withTenant } from '@/lib/tenant';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';

const AssignCaseSchema = z.object({
  userId: z.string(),
  roleId: z.string().optional(),
  version: z.number().int().min(1, 'Version is required for updates')
});

async function getParams(context: { params: Promise<{ id: string }> }) {
  return await context.params;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const rateLimitError = await rateLimitMiddleware(req, 30);
    if (rateLimitError) return rateLimitError;

    const { id } = await getParams(context);
    const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
    logRequest(req, session);
    if (!session) return unauthorizedResponse();

    if (!['ADMIN', 'PROCESS_MANAGER'].includes(session.role)) {
      return forbiddenResponse();
    }

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    const body = await req.json();
    const validation = AssignCaseSchema.safeParse(body);
    if (!validation.success) return validationErrorResponse(validation.error.errors.map(e => e.message));

    const { userId, roleId, version } = validation.data;

    return await withTenant(session.tenantId, async () => {
      const caseItem = await prisma.case.findFirst({
        where: { caseId: id, tenantId: session.tenantId }
      });

      if (!caseItem) return notFoundResponse('Case');

      const targetUser = await prisma.user.findFirst({
        where: { id: userId, tenantId: session.tenantId }
      });

      if (!targetUser) return notFoundResponse('User');

      try {
        const updatedCase = await updateWithOptimisticLock(
          prisma.case,
          { caseId: id, tenantId: session.tenantId },
          {
            currentVersion: version,
            data: {
              assignedProcessUserId: userId,
              assignedRole: roleId || 'PROCESS_EXECUTIVE',
            }
          },
          'Case'
        );

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

        const response = successResponse(updatedCase, "Case assigned successfully");
        await storeIdempotencyResult(req, response);
        return response;

      } catch (error) {
        const lockError = handleOptimisticLockError(error);
        if (lockError) {
          return NextResponse.json(lockError, { status: 409 });
        }
        throw error;
      }
    });

  } catch (error) {
    return handleApiError(error);
  }
}
