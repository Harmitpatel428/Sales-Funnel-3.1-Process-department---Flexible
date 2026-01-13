-- DropIndex
DROP INDEX "emails_status_idx";

-- DropIndex
DROP INDEX "emails_direction_idx";

-- DropIndex
DROP INDEX "emails_sentById_idx";

-- DropIndex
DROP INDEX "emails_caseId_idx";

-- DropIndex
DROP INDEX "emails_leadId_idx";

-- DropIndex
DROP INDEX "emails_threadId_idx";

-- DropIndex
DROP INDEX "emails_tenantId_idx";

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "caseId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases" ("caseId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" TEXT NOT NULL,
    "chartType" TEXT NOT NULL DEFAULT 'TABLE',
    "filters" TEXT NOT NULL DEFAULT '[]',
    "groupBy" TEXT,
    "sortBy" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "saved_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "saved_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "sharedWith" TEXT NOT NULL DEFAULT '[]',
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "report_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "report_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT,
    "tenantId" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'EXCEL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "scheduled_reports_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "saved_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scheduled_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scheduled_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" TEXT NOT NULL DEFAULT '{}',
    "entityType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workflows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "actionType" TEXT,
    "actionConfig" TEXT NOT NULL DEFAULT '{}',
    "conditionType" TEXT,
    "conditionConfig" TEXT NOT NULL DEFAULT '{}',
    "parentStepId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_steps_parentStepId_fkey" FOREIGN KEY ("parentStepId") REFERENCES "workflow_steps" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "executionLog" TEXT NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "triggeredBy" TEXT,
    "triggerData" TEXT NOT NULL DEFAULT '{}',
    "currentStepId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_executions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" TEXT NOT NULL DEFAULT '{}',
    "lastCalculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "lead_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lead_scores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "statusTrigger" TEXT NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "escalationWorkflowId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sla_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sla_policies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sla_policies_escalationWorkflowId_fkey" FOREIGN KEY ("escalationWorkflowId") REFERENCES "workflows" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sla_trackers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slaId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "breachNotificationSent" BOOLEAN NOT NULL DEFAULT false,
    "escalationTriggered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sla_trackers_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "sla_policies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sla_trackers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowExecutionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approverIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalType" TEXT NOT NULL DEFAULT 'ANY',
    "approvedBy" TEXT NOT NULL DEFAULT '[]',
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "expiresAt" DATETIME,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "approval_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "scopes" TEXT NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "description" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_usage_logs_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" TEXT NOT NULL,
    "redirectUris" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "grantTypes" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "privacyUrl" TEXT,
    "termsUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "oauth_clients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scopes" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oauth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'API_KEY',
    "authConfig" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelay" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "webhook_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "webhook_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "webhook_subscriptions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "configSchema" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "author" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "integration_installations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "integrationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "credentials" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT,
    "syncError" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "integration_installations_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "integration_installations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "integration_installations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "activity_logs_tenantId_idx" ON "activity_logs"("tenantId");

-- CreateIndex
CREATE INDEX "activity_logs_leadId_idx" ON "activity_logs"("leadId");

-- CreateIndex
CREATE INDEX "activity_logs_caseId_idx" ON "activity_logs"("caseId");

-- CreateIndex
CREATE INDEX "activity_logs_type_idx" ON "activity_logs"("type");

-- CreateIndex
CREATE INDEX "saved_reports_tenantId_idx" ON "saved_reports"("tenantId");

-- CreateIndex
CREATE INDEX "saved_reports_createdById_idx" ON "saved_reports"("createdById");

-- CreateIndex
CREATE INDEX "report_templates_tenantId_idx" ON "report_templates"("tenantId");

-- CreateIndex
CREATE INDEX "report_templates_category_idx" ON "report_templates"("category");

-- CreateIndex
CREATE INDEX "scheduled_reports_tenantId_idx" ON "scheduled_reports"("tenantId");

-- CreateIndex
CREATE INDEX "scheduled_reports_nextRunAt_idx" ON "scheduled_reports"("nextRunAt");

-- CreateIndex
CREATE INDEX "workflows_tenantId_idx" ON "workflows"("tenantId");

-- CreateIndex
CREATE INDEX "workflows_entityType_idx" ON "workflows"("entityType");

-- CreateIndex
CREATE INDEX "workflows_triggerType_idx" ON "workflows"("triggerType");

-- CreateIndex
CREATE INDEX "workflows_isActive_idx" ON "workflows"("isActive");

-- CreateIndex
CREATE INDEX "workflow_steps_workflowId_idx" ON "workflow_steps"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_steps_stepOrder_idx" ON "workflow_steps"("stepOrder");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_idx" ON "workflow_executions"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_executions_tenantId_idx" ON "workflow_executions"("tenantId");

-- CreateIndex
CREATE INDEX "workflow_executions_entityType_entityId_idx" ON "workflow_executions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions"("status");

-- CreateIndex
CREATE INDEX "workflow_executions_startedAt_idx" ON "workflow_executions"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_scores_leadId_key" ON "lead_scores"("leadId");

-- CreateIndex
CREATE INDEX "lead_scores_tenantId_idx" ON "lead_scores"("tenantId");

-- CreateIndex
CREATE INDEX "lead_scores_leadId_idx" ON "lead_scores"("leadId");

-- CreateIndex
CREATE INDEX "lead_scores_score_idx" ON "lead_scores"("score");

-- CreateIndex
CREATE INDEX "sla_policies_tenantId_idx" ON "sla_policies"("tenantId");

-- CreateIndex
CREATE INDEX "sla_policies_entityType_idx" ON "sla_policies"("entityType");

-- CreateIndex
CREATE INDEX "sla_policies_isActive_idx" ON "sla_policies"("isActive");

-- CreateIndex
CREATE INDEX "sla_trackers_slaId_idx" ON "sla_trackers"("slaId");

-- CreateIndex
CREATE INDEX "sla_trackers_tenantId_idx" ON "sla_trackers"("tenantId");

-- CreateIndex
CREATE INDEX "sla_trackers_entityType_entityId_idx" ON "sla_trackers"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "sla_trackers_status_idx" ON "sla_trackers"("status");

-- CreateIndex
CREATE INDEX "sla_trackers_dueAt_idx" ON "sla_trackers"("dueAt");

-- CreateIndex
CREATE INDEX "approval_requests_tenantId_idx" ON "approval_requests"("tenantId");

-- CreateIndex
CREATE INDEX "approval_requests_entityType_entityId_idx" ON "approval_requests"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_requestedAt_idx" ON "approval_requests"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "api_usage_logs_apiKeyId_timestamp_idx" ON "api_usage_logs"("apiKeyId", "timestamp");

-- CreateIndex
CREATE INDEX "api_usage_logs_timestamp_idx" ON "api_usage_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

-- CreateIndex
CREATE INDEX "oauth_clients_tenantId_idx" ON "oauth_clients"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_accessToken_key" ON "oauth_tokens"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_refreshToken_key" ON "oauth_tokens"("refreshToken");

-- CreateIndex
CREATE INDEX "oauth_tokens_accessToken_idx" ON "oauth_tokens"("accessToken");

-- CreateIndex
CREATE INDEX "oauth_tokens_refreshToken_idx" ON "oauth_tokens"("refreshToken");

-- CreateIndex
CREATE INDEX "oauth_tokens_userId_idx" ON "oauth_tokens"("userId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenantId_idx" ON "webhook_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_subscriptionId_status_idx" ON "webhook_deliveries"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_nextRetryAt_idx" ON "webhook_deliveries"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_slug_key" ON "integrations"("slug");

-- CreateIndex
CREATE INDEX "integrations_slug_idx" ON "integrations"("slug");

-- CreateIndex
CREATE INDEX "integrations_category_idx" ON "integrations"("category");

-- CreateIndex
CREATE INDEX "integration_installations_tenantId_idx" ON "integration_installations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_installations_integrationId_tenantId_key" ON "integration_installations"("integrationId", "tenantId");
