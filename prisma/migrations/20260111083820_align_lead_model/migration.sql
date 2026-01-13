-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subdomain" TEXT,
    "slug" TEXT NOT NULL,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trialEndsAt" DATETIME,
    "subscriptionEndsAt" DATETIME,
    "brandingConfig" TEXT NOT NULL DEFAULT '{}',
    "features" TEXT NOT NULL DEFAULT '{}',
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "workflowSettings" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SALES_EXECUTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME,
    "passwordLastChangedAt" DATETIME,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientName" TEXT,
    "mobileNumber" TEXT,
    "email" TEXT,
    "company" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "kva" TEXT,
    "connectionDate" DATETIME,
    "consumerNumber" TEXT,
    "discom" TEXT,
    "gidc" TEXT,
    "gstNumber" TEXT,
    "companyLocation" TEXT,
    "unitType" TEXT,
    "marketingObjective" TEXT,
    "budget" TEXT,
    "termLoan" TEXT,
    "timeline" TEXT,
    "contactOwner" TEXT,
    "lastActivityDate" DATETIME,
    "followUpDate" DATETIME,
    "finalConclusion" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isUpdated" BOOLEAN NOT NULL DEFAULT false,
    "mandateStatus" TEXT,
    "documentStatus" TEXT,
    "convertedToCaseId" TEXT,
    "convertedAt" DATETIME,
    "assignedBy" TEXT,
    "assignedAt" DATETIME,
    "mobileNumbers" TEXT DEFAULT '[]',
    "activities" TEXT DEFAULT '[]',
    "submitted_payload" TEXT DEFAULT '{}',
    "customFields" TEXT DEFAULT '{}',
    "assignedToId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cases" (
    "caseId" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "schemeType" TEXT,
    "caseType" TEXT,
    "benefitTypes" TEXT DEFAULT '[]',
    "assignedProcessUserId" TEXT,
    "assignedRole" TEXT,
    "processStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "closedAt" DATETIME,
    "closureReason" TEXT,
    "clientName" TEXT,
    "company" TEXT,
    "mobileNumber" TEXT,
    "consumerNumber" TEXT,
    "kva" TEXT,
    "contacts" TEXT DEFAULT '[]',
    "talukaCategory" TEXT,
    "termLoanAmount" TEXT,
    "plantMachineryValue" TEXT,
    "electricityLoad" TEXT,
    "electricityLoadType" TEXT,
    "originalLeadData" TEXT DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "cases_assignedProcessUserId_fkey" FOREIGN KEY ("assignedProcessUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "performedById" TEXT,
    "performedByName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "beforeValue" TEXT DEFAULT '{}',
    "afterValue" TEXT DEFAULT '{}',
    "changesSummary" TEXT,
    "metadata" TEXT DEFAULT '{}',
    "previousHash" TEXT,
    "hash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    CONSTRAINT "audit_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "saved_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_subdomain_idx" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_followUpDate_idx" ON "leads"("followUpDate");

-- CreateIndex
CREATE INDEX "leads_lastActivityDate_idx" ON "leads"("lastActivityDate");

-- CreateIndex
CREATE INDEX "leads_isDone_idx" ON "leads"("isDone");

-- CreateIndex
CREATE INDEX "leads_isDeleted_idx" ON "leads"("isDeleted");

-- CreateIndex
CREATE INDEX "leads_convertedToCaseId_idx" ON "leads"("convertedToCaseId");

-- CreateIndex
CREATE INDEX "leads_assignedToId_idx" ON "leads"("assignedToId");

-- CreateIndex
CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");

-- CreateIndex
CREATE INDEX "cases_leadId_idx" ON "cases"("leadId");

-- CreateIndex
CREATE INDEX "cases_processStatus_idx" ON "cases"("processStatus");

-- CreateIndex
CREATE INDEX "cases_assignedProcessUserId_idx" ON "cases"("assignedProcessUserId");

-- CreateIndex
CREATE INDEX "cases_tenantId_idx" ON "cases"("tenantId");

-- CreateIndex
CREATE INDEX "cases_createdAt_idx" ON "cases"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actionType_idx" ON "audit_logs"("actionType");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_performedById_idx" ON "audit_logs"("performedById");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "saved_views_tenantId_idx" ON "saved_views"("tenantId");
