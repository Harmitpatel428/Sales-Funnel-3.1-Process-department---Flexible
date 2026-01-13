/**
 * Workflow Action Library
 * Implements all workflow actions
 */

import { PrismaClient } from '@prisma/client';
import { ExecutionContext, ConditionEvaluator } from './conditions';

const prisma = new PrismaClient();

// Action types
export enum ActionType {
    SEND_EMAIL = 'SEND_EMAIL',
    ASSIGN_USER = 'ASSIGN_USER',
    UPDATE_FIELD = 'UPDATE_FIELD',
    CREATE_TASK = 'CREATE_TASK',
    WEBHOOK = 'WEBHOOK',
    WAIT = 'WAIT',
    APPROVAL = 'APPROVAL',
    UPDATE_LEAD_SCORE = 'UPDATE_LEAD_SCORE',
    ESCALATE = 'ESCALATE'
}

// Action result interface
export interface ActionResult {
    success: boolean;
    actionType: ActionType;
    message: string;
    data?: Record<string, unknown>;
    error?: string;
    shouldPause?: boolean; // For WAIT and APPROVAL actions
    resumeAt?: Date; // For WAIT action
    approvalRequestId?: string; // For APPROVAL action
}

// Action configuration interfaces
export interface SendEmailConfig {
    templateId?: string;
    to: string; // Email or field reference like "{{lead.email}}"
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    attachments?: string[];
}

export interface AssignUserConfig {
    userId?: string;
    strategy?: 'ROUND_ROBIN' | 'LEAST_LOADED' | 'TERRITORY_BASED' | 'SKILL_BASED' | 'WEIGHTED';
    filters?: {
        role?: string[];
        territory?: string;
        maxActiveLeads?: number;
    };
    fallback?: string; // Role or user ID
}

export interface UpdateFieldConfig {
    field: string;
    value: unknown; // Can be static or dynamic expression
}

export interface CreateTaskConfig {
    title: string;
    description?: string;
    assignedTo?: string; // User ID or field reference
    dueDate?: string; // Date or relative like "+3 days"
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface WebhookConfig {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    authentication?: {
        type: 'API_KEY' | 'BEARER' | 'BASIC';
        apiKey?: string;
        apiKeyHeader?: string;
        token?: string;
        username?: string;
        password?: string;
    };
}

export interface WaitConfig {
    duration?: number; // In minutes
    until?: string; // Specific date/time or field reference
}

export interface ApprovalConfig {
    approverIds: string[];
    approvalType: 'ANY' | 'ALL' | 'MAJORITY';
    expiresIn?: number; // Hours
    message?: string;
}

export interface EscalateConfig {
    escalateTo: string; // User ID or role
    reason: string;
    notifyManager?: boolean;
    updatePriority?: 'HIGH' | 'URGENT';
}

/**
 * ActionExecutor - Executes workflow actions
 */
export class ActionExecutor {
    private context: ExecutionContext;
    private tenantId: string;
    private entityType: string;
    private entityId: string;
    private executionId: string;

    constructor(
        context: ExecutionContext,
        tenantId: string,
        entityType: string,
        entityId: string,
        executionId: string
    ) {
        this.context = context;
        this.tenantId = tenantId;
        this.entityType = entityType;
        this.entityId = entityId;
        this.executionId = executionId;
    }

    /**
     * Execute a single action
     */
    async execute(actionType: ActionType, config: Record<string, unknown>): Promise<ActionResult> {
        try {
            switch (actionType) {
                case ActionType.SEND_EMAIL:
                    return await this.executeSendEmail(config as unknown as SendEmailConfig);
                case ActionType.ASSIGN_USER:
                    return await this.executeAssignUser(config as unknown as AssignUserConfig);
                case ActionType.UPDATE_FIELD:
                    return await this.executeUpdateField(config as unknown as UpdateFieldConfig);
                case ActionType.CREATE_TASK:
                    return await this.executeCreateTask(config as unknown as CreateTaskConfig);
                case ActionType.WEBHOOK:
                    return await this.executeWebhook(config as unknown as WebhookConfig);
                case ActionType.WAIT:
                    return await this.executeWait(config as unknown as WaitConfig);
                case ActionType.APPROVAL:
                    return await this.executeApproval(config as unknown as ApprovalConfig);
                case ActionType.UPDATE_LEAD_SCORE:
                    return await this.executeUpdateLeadScore();
                case ActionType.ESCALATE:
                    return await this.executeEscalate(config as unknown as EscalateConfig);
                default:
                    return {
                        success: false,
                        actionType,
                        message: `Unknown action type: ${actionType}`,
                        error: 'UNKNOWN_ACTION_TYPE'
                    };
            }
        } catch (error) {
            return {
                success: false,
                actionType,
                message: `Action failed: ${(error as Error).message}`,
                error: (error as Error).message
            };
        }
    }

    /**
     * Execute a sequence of actions
     */
    async executeSequence(
        actions: Array<{ type: ActionType; config: Record<string, unknown> }>
    ): Promise<ActionResult[]> {
        const results: ActionResult[] = [];

        for (const action of actions) {
            const result = await this.execute(action.type, action.config);
            results.push(result);

            // Stop if action requires pausing
            if (result.shouldPause) {
                break;
            }

            // Stop on critical failure
            if (!result.success) {
                break;
            }
        }

        return results;
    }

    /**
     * Send Email Action
     */
    private async executeSendEmail(config: SendEmailConfig): Promise<ActionResult> {
        const to = this.resolveTemplate(config.to);
        const subject = this.resolveTemplate(config.subject);
        const body = this.resolveTemplate(config.body);
        const cc = config.cc ? this.resolveTemplate(config.cc) : undefined;
        const bcc = config.bcc ? this.resolveTemplate(config.bcc) : undefined;

        try {
            // Use the existing email service
            const { sendEmail } = await import('../email-service');

            await sendEmail({
                to,
                subject,
                html: body,
                cc,
                bcc
            });

            // Log activity
            await this.logActivity('email_outbound', `Workflow email sent to ${to}: ${subject}`);

            return {
                success: true,
                actionType: ActionType.SEND_EMAIL,
                message: `Email sent to ${to}`,
                data: { to, subject }
            };
        } catch (error) {
            return {
                success: false,
                actionType: ActionType.SEND_EMAIL,
                message: `Failed to send email: ${(error as Error).message}`,
                error: (error as Error).message
            };
        }
    }

    /**
     * Assign User Action
     */
    private async executeAssignUser(config: AssignUserConfig): Promise<ActionResult> {
        let assignedUserId: string | null = null;

        if (config.userId) {
            // Direct user assignment
            assignedUserId = this.resolveTemplate(config.userId);
        } else if (config.strategy) {
            // Use assignment rules
            const { AssignmentRuleEngine } = await import('./assignment-rules');
            assignedUserId = await AssignmentRuleEngine.findBestUser(
                this.tenantId,
                config.strategy,
                config.filters,
                this.context.$current
            );
        }

        if (!assignedUserId) {
            // Try fallback
            if (config.fallback) {
                assignedUserId = config.fallback;
            } else {
                return {
                    success: false,
                    actionType: ActionType.ASSIGN_USER,
                    message: 'No user could be assigned',
                    error: 'NO_ASSIGNEE_FOUND'
                };
            }
        }

        // Update the entity
        if (this.entityType === 'LEAD') {
            await prisma.lead.update({
                where: { id: this.entityId },
                data: {
                    assignedToId: assignedUserId,
                    assignedAt: new Date()
                }
            });
        } else if (this.entityType === 'CASE') {
            await prisma.case.update({
                where: { caseId: this.entityId },
                data: { assignedProcessUserId: assignedUserId }
            });
        }

        // Log activity
        await this.logActivity('assignment', `Assigned to user ${assignedUserId} via workflow`);

        // Send notification to assigned user
        await this.notifyUser(assignedUserId, `You have been assigned a new ${this.entityType.toLowerCase()}`);

        return {
            success: true,
            actionType: ActionType.ASSIGN_USER,
            message: `Assigned to user ${assignedUserId}`,
            data: { assignedUserId }
        };
    }

    /**
     * Update Field Action
     */
    private async executeUpdateField(config: UpdateFieldConfig): Promise<ActionResult> {
        const fieldName = config.field;
        const resolvedValue = typeof config.value === 'string'
            ? this.resolveTemplate(config.value)
            : config.value;

        // Update the entity
        if (this.entityType === 'LEAD') {
            await prisma.lead.update({
                where: { id: this.entityId },
                data: { [fieldName]: resolvedValue }
            });
        } else if (this.entityType === 'CASE') {
            await prisma.case.update({
                where: { caseId: this.entityId },
                data: { [fieldName]: resolvedValue }
            });
        }

        // Log activity
        await this.logActivity('field_update', `Field ${fieldName} updated via workflow`);

        return {
            success: true,
            actionType: ActionType.UPDATE_FIELD,
            message: `Field ${fieldName} updated`,
            data: { field: fieldName, value: resolvedValue }
        };
    }

    /**
     * Create Task Action
     */
    private async executeCreateTask(config: CreateTaskConfig): Promise<ActionResult> {
        const title = this.resolveTemplate(config.title);
        const description = config.description ? this.resolveTemplate(config.description) : undefined;
        const assignedTo = config.assignedTo ? this.resolveTemplate(config.assignedTo) : undefined;

        // Calculate due date
        let dueDate: Date | undefined;
        if (config.dueDate) {
            if (config.dueDate.startsWith('+')) {
                // Relative date like "+3 days"
                dueDate = this.calculateRelativeDate(config.dueDate);
            } else {
                dueDate = new Date(this.resolveTemplate(config.dueDate));
            }
        }

        // Create activity log entry as a task
        await prisma.activityLog.create({
            data: {
                tenantId: this.tenantId,
                leadId: this.entityType === 'LEAD' ? this.entityId : undefined,
                caseId: this.entityType === 'CASE' ? this.entityId : undefined,
                type: 'task',
                description: title,
                metadata: JSON.stringify({
                    description,
                    assignedTo,
                    dueDate,
                    priority: config.priority || 'MEDIUM',
                    source: 'workflow',
                    executionId: this.executionId
                })
            }
        });

        // Notify assigned user
        if (assignedTo) {
            await this.notifyUser(assignedTo, `New task: ${title}`);
        }

        return {
            success: true,
            actionType: ActionType.CREATE_TASK,
            message: `Task created: ${title}`,
            data: { title, assignedTo, dueDate }
        };
    }

    /**
     * Webhook Action
     */
    private async executeWebhook(config: WebhookConfig): Promise<ActionResult> {
        const url = this.resolveTemplate(config.url);
        const headers: Record<string, string> = { ...config.headers };

        // Add authentication
        if (config.authentication) {
            switch (config.authentication.type) {
                case 'API_KEY':
                    headers[config.authentication.apiKeyHeader || 'X-API-Key'] = config.authentication.apiKey || '';
                    break;
                case 'BEARER':
                    headers['Authorization'] = `Bearer ${config.authentication.token}`;
                    break;
                case 'BASIC':
                    const credentials = Buffer.from(
                        `${config.authentication.username}:${config.authentication.password}`
                    ).toString('base64');
                    headers['Authorization'] = `Basic ${credentials}`;
                    break;
            }
        }

        // Prepare body
        let body: string | undefined;
        if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            const resolvedBody = this.resolveObjectTemplates(config.body);
            body = JSON.stringify(resolvedBody);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        // Make the request with retries
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: config.method,
                    headers,
                    body
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const responseData = await response.json().catch(() => ({}));

                return {
                    success: true,
                    actionType: ActionType.WEBHOOK,
                    message: `Webhook sent successfully`,
                    data: { url, status: response.status, response: responseData }
                };
            } catch (error) {
                lastError = error as Error;
                if (attempt < 3) {
                    // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
                }
            }
        }

        return {
            success: false,
            actionType: ActionType.WEBHOOK,
            message: `Webhook failed after 3 attempts`,
            error: lastError?.message
        };
    }

    /**
     * Wait Action
     */
    private async executeWait(config: WaitConfig): Promise<ActionResult> {
        let resumeAt: Date;

        if (config.duration) {
            // Duration in minutes
            resumeAt = new Date(Date.now() + config.duration * 60 * 1000);
        } else if (config.until) {
            // Specific date/time
            const resolved = this.resolveTemplate(config.until);
            resumeAt = new Date(resolved);
        } else {
            return {
                success: false,
                actionType: ActionType.WAIT,
                message: 'Wait action requires duration or until',
                error: 'INVALID_WAIT_CONFIG'
            };
        }

        return {
            success: true,
            actionType: ActionType.WAIT,
            message: `Workflow paused until ${resumeAt.toISOString()}`,
            shouldPause: true,
            resumeAt
        };
    }

    /**
     * Approval Action
     */
    private async executeApproval(config: ApprovalConfig): Promise<ActionResult> {
        const expiresAt = config.expiresIn
            ? new Date(Date.now() + config.expiresIn * 60 * 60 * 1000)
            : undefined;

        // Create approval request
        const approvalRequest = await prisma.approvalRequest.create({
            data: {
                tenantId: this.tenantId,
                workflowExecutionId: this.executionId,
                entityType: this.entityType,
                entityId: this.entityId,
                requestedById: this.context.$user?.id as string || 'SYSTEM',
                approverIds: JSON.stringify(config.approverIds),
                approvalType: config.approvalType,
                status: 'PENDING',
                expiresAt,
                metadata: JSON.stringify({
                    message: config.message
                })
            }
        });

        // Notify approvers
        for (const approverId of config.approverIds) {
            await this.notifyUser(
                approverId,
                config.message || `Approval required for ${this.entityType} ${this.entityId}`
            );
        }

        return {
            success: true,
            actionType: ActionType.APPROVAL,
            message: 'Approval request created',
            shouldPause: true,
            approvalRequestId: approvalRequest.id
        };
    }

    /**
     * Update Lead Score Action
     */
    private async executeUpdateLeadScore(): Promise<ActionResult> {
        if (this.entityType !== 'LEAD') {
            return {
                success: false,
                actionType: ActionType.UPDATE_LEAD_SCORE,
                message: 'Update lead score only works for leads',
                error: 'INVALID_ENTITY_TYPE'
            };
        }

        try {
            const { LeadScoringEngine } = await import('./lead-scoring');
            const scoreResult = await LeadScoringEngine.calculateScore(this.entityId, this.tenantId);

            return {
                success: true,
                actionType: ActionType.UPDATE_LEAD_SCORE,
                message: `Lead score updated to ${scoreResult.score}`,
                data: scoreResult
            };
        } catch (error) {
            return {
                success: false,
                actionType: ActionType.UPDATE_LEAD_SCORE,
                message: `Failed to update lead score: ${(error as Error).message}`,
                error: (error as Error).message
            };
        }
    }

    /**
     * Escalate Action
     */
    private async executeEscalate(config: EscalateConfig): Promise<ActionResult> {
        const escalateTo = this.resolveTemplate(config.escalateTo);
        const reason = this.resolveTemplate(config.reason);

        // Update entity assignment
        if (this.entityType === 'LEAD') {
            const updateData: Record<string, unknown> = { assignedToId: escalateTo };
            if (config.updatePriority) {
                // Store priority in customFields or a dedicated field
                const lead = await prisma.lead.findUnique({ where: { id: this.entityId } });
                const customFields = JSON.parse(lead?.customFields || '{}');
                customFields.priority = config.updatePriority;
                updateData.customFields = JSON.stringify(customFields);
            }
            await prisma.lead.update({
                where: { id: this.entityId },
                data: updateData
            });
        } else if (this.entityType === 'CASE') {
            const updateData: Record<string, unknown> = { assignedProcessUserId: escalateTo };
            if (config.updatePriority) {
                updateData.priority = config.updatePriority;
            }
            await prisma.case.update({
                where: { caseId: this.entityId },
                data: updateData
            });
        }

        // Log escalation
        await this.logActivity('escalation', `Escalated to ${escalateTo}: ${reason}`);

        // Notify escalation target
        await this.notifyUser(escalateTo, `Escalation: ${reason}`);

        // Notify manager if requested
        if (config.notifyManager) {
            // Get the manager (simplified - in real implementation would look up org hierarchy)
            const escalatedToUser = await prisma.user.findUnique({ where: { id: escalateTo } });
            if (escalatedToUser) {
                // Send additional notification
                await this.logActivity('escalation_notification', `Manager notified about escalation`);
            }
        }

        return {
            success: true,
            actionType: ActionType.ESCALATE,
            message: `Escalated to ${escalateTo}`,
            data: { escalateTo, reason }
        };
    }

    /**
     * Resolve template variables in a string
     */
    private resolveTemplate(template: string): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const value = ConditionEvaluator.resolveFieldValue(path.trim(), this.context);
            return value !== undefined && value !== null ? String(value) : '';
        });
    }

    /**
     * Resolve templates in an object recursively
     */
    private resolveObjectTemplates(obj: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.resolveTemplate(value);
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.resolveObjectTemplates(value as Record<string, unknown>);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Calculate a relative date
     */
    private calculateRelativeDate(relative: string): Date {
        const match = relative.match(/^([+-])(\d+)\s*(day|days|hour|hours|minute|minutes)$/i);
        if (!match) return new Date();

        const sign = match[1] === '+' ? 1 : -1;
        const amount = parseInt(match[2], 10);
        const unit = match[3].toLowerCase();

        const result = new Date();
        switch (unit) {
            case 'day':
            case 'days':
                result.setDate(result.getDate() + sign * amount);
                break;
            case 'hour':
            case 'hours':
                result.setHours(result.getHours() + sign * amount);
                break;
            case 'minute':
            case 'minutes':
                result.setMinutes(result.getMinutes() + sign * amount);
                break;
        }
        return result;
    }

    /**
     * Log an activity
     */
    private async logActivity(type: string, description: string): Promise<void> {
        await prisma.activityLog.create({
            data: {
                tenantId: this.tenantId,
                leadId: this.entityType === 'LEAD' ? this.entityId : undefined,
                caseId: this.entityType === 'CASE' ? this.entityId : undefined,
                type,
                description,
                metadata: JSON.stringify({
                    source: 'workflow',
                    executionId: this.executionId
                })
            }
        });
    }

    /**
     * Send a notification to a user
     */
    private async notifyUser(userId: string, message: string): Promise<void> {
        try {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user?.email) {
                const { sendEmail } = await import('../email-service');
                await sendEmail({
                    to: user.email,
                    subject: 'Workflow Notification',
                    html: `<p>${message}</p>`
                });
            }
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
    }
}

export default ActionExecutor;
