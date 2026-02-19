/**
 * Approval Workflow Handler
 * Manages approval requests and workflow resumption
 */

import { PrismaClient, ApprovalRequest } from '@prisma/client';

const prisma = new PrismaClient();

export enum ApprovalStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED'
}

export enum ApprovalType {
    ANY = 'ANY',
    ALL = 'ALL',
    MAJORITY = 'MAJORITY'
}

export interface ApprovalDecision {
    userId: string;
    decision: 'APPROVE' | 'REJECT';
    comments?: string;
    timestamp: Date;
}

export class ApprovalHandler {
    static async createApprovalRequest(
        workflowExecutionId: string,
        tenantId: string,
        entityType: string,
        entityId: string,
        requestedById: string,
        approverIds: string[],
        approvalType: ApprovalType,
        expiresIn?: number,
        message?: string
    ): Promise<ApprovalRequest> {
        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
            : undefined;

        const request = await prisma.approvalRequest.create({
            data: {
                tenantId,
                workflowExecutionId,
                entityType,
                entityId,
                requestedById,
                approverIds: JSON.stringify(approverIds),
                approvalType,
                status: ApprovalStatus.PENDING,
                expiresAt,
                metadata: JSON.stringify({ message })
            }
        });

        await this.notifyApprovers(request.id, approverIds, message);
        return request;
    }

    static async submitApproval(
        requestId: string,
        userId: string,
        decision: 'APPROVE' | 'REJECT',
        comments?: string
    ): Promise<{ approved: boolean; status: ApprovalStatus }> {
        const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
        if (!request || request.status !== ApprovalStatus.PENDING) {
            throw new Error('Invalid approval request');
        }

        const approverIds = JSON.parse(request.approverIds) as string[];
        if (!approverIds.includes(userId)) {
            throw new Error('Not authorized');
        }

        const approvedByList = JSON.parse(request.approvedBy) as ApprovalDecision[];
        const timestamp = new Date();

        if (decision === 'APPROVE') {
            approvedByList.push({ userId, decision: 'APPROVE', comments, timestamp });
            const isMet = this.checkApprovalCriteria(
                request.approvalType as ApprovalType,
                approverIds,
                approvedByList
            );

            if (isMet) {
                await prisma.approvalRequest.update({
                    where: { id: requestId },
                    data: {
                        approvedBy: JSON.stringify(approvedByList),
                        status: ApprovalStatus.APPROVED,
                        respondedAt: timestamp
                    }
                });
                await this.resumeWorkflow(request.workflowExecutionId);
                return { approved: true, status: ApprovalStatus.APPROVED };
            }

            await prisma.approvalRequest.update({
                where: { id: requestId },
                data: { approvedBy: JSON.stringify(approvedByList) }
            });
            return { approved: false, status: ApprovalStatus.PENDING };
        }

        await prisma.approvalRequest.update({
            where: { id: requestId },
            data: {
                status: ApprovalStatus.REJECTED,
                rejectedBy: userId,
                rejectionReason: comments,
                respondedAt: timestamp
            }
        });

        const { WorkflowExecutor } = await import('./executor');
        await WorkflowExecutor.cancelExecution(request.workflowExecutionId, userId);
        return { approved: false, status: ApprovalStatus.REJECTED };
    }

    static checkApprovalCriteria(
        approvalType: ApprovalType,
        approverIds: string[],
        approvedByList: ApprovalDecision[]
    ): boolean {
        const approvals = approvedByList.filter(a => a.decision === 'APPROVE');
        switch (approvalType) {
            case ApprovalType.ANY: return approvals.length >= 1;
            case ApprovalType.ALL: return approvals.length >= approverIds.length;
            case ApprovalType.MAJORITY: return approvals.length > approverIds.length / 2;
            default: return false;
        }
    }

    static async resumeWorkflow(workflowExecutionId: string): Promise<void> {
        const { getWorkflowQueue } = await import('../jobs/workflow-executor');
        const queue = getWorkflowQueue();
        await queue.add('RESUME_WORKFLOW', { executionId: workflowExecutionId });
    }

    static async notifyApprovers(requestId: string, approverIds: string[], message?: string): Promise<void> {
        // Email service has been removed.
        console.log(`Approval requested from [${approverIds.join(', ')}]: ${message || 'No message'}`);
    }

    static async getPendingApprovals(userId: string, tenantId: string): Promise<ApprovalRequest[]> {
        const requests = await prisma.approvalRequest.findMany({
            where: { tenantId, status: ApprovalStatus.PENDING },
            include: { requestedBy: true, workflowExecution: { include: { workflow: true } } },
            orderBy: { requestedAt: 'desc' }
        });
        return requests.filter(r => {
            const approverIds = JSON.parse(r.approverIds) as string[];
            return approverIds.includes(userId);
        });
    }

    static async cancelApproval(requestId: string, userId: string): Promise<void> {
        const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
        if (!request || request.status !== ApprovalStatus.PENDING || request.requestedById !== userId) {
            throw new Error('Cannot cancel request');
        }
        await prisma.approvalRequest.update({
            where: { id: requestId },
            data: { status: ApprovalStatus.CANCELLED, respondedAt: new Date() }
        });
        const { WorkflowExecutor } = await import('./executor');
        await WorkflowExecutor.cancelExecution(request.workflowExecutionId, userId);
    }
}

export default ApprovalHandler;
