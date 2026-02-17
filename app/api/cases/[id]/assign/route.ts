import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitCaseUpdated } from '@/lib/websocket/server';

const AssignCaseSchema = z.object({
  userId: z.string(),
  roleId: z.string().optional(),
  version: z.number().int().min(1, 'Version is required for updates')
});

import { PERMISSIONS } from '@/app/types/permissions';

const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
  const { session, params: paramsPromise } = context;
  // session check removed

  const params = await paramsPromise;
  const id = params?.id;
  if (!id) return notFoundResponse('Case');

  // Role check removed - handled by declarative permissions (CASES_ASSIGN)

  // Check idempotency
  const idempotencyError = await idempotencyMiddleware(req, session!.tenantId);
  if (idempotencyError) return idempotencyError;

  const body = await req.json();
  const validation = AssignCaseSchema.safeParse(body);
  if (!validation.success) return validationErrorResponse(validation.error.errors.map(e => e.message));

  const { userId, roleId, version } = validation.data;

  return await withTenant(session!.tenantId, async () => {
    const caseItem = await prisma.case.findFirst({
      where: { caseId: id, tenantId: session!.tenantId }
    });

    if (!caseItem) return notFoundResponse('Case');

    // Capture old data for workflow triggers
    const oldData = caseItem as unknown as Record<string, unknown>;

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, tenantId: session!.tenantId }
    });

    if (!targetUser) return notFoundResponse('User');

    try {
      const updatedCase = await updateWithOptimisticLock(
        prisma.case,
        { caseId: id, tenantId: session!.tenantId },
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
          performedById: session!.userId,
          tenantId: session!.tenantId
        }
      });

      // Trigger workflows for assignment
      try {
        await TriggerManager.triggerWorkflows(
          EntityType.CASE,
          (updatedCase as any).caseId,
          'UPDATE',
          oldData,
          updatedCase as unknown as Record<string, unknown>,
          session!.tenantId,
          session!.userId
        );
      } catch (workflowError) {
        console.error('Failed to trigger workflows for case assignment:', workflowError);
      }

      // WebSocket Broadcast
      try {
        await emitCaseUpdated(session!.tenantId, updatedCase);
      } catch (wsError) {
        console.error('[WebSocket] Case assignment broadcast failed:', wsError);
      }

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
};

export const POST = withApiHandler({
  authRequired: true,
  checkDbHealth: true,
  rateLimit: 30,
  permissions: [PERMISSIONS.CASES_ASSIGN]
}, postHandler);
