-- CreateTable
CREATE TABLE "idempotency_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cases" (
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
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cases_assignedProcessUserId_fkey" FOREIGN KEY ("assignedProcessUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_cases" ("assignedProcessUserId", "assignedRole", "benefitTypes", "caseId", "caseNumber", "caseType", "clientName", "closedAt", "closureReason", "company", "consumerNumber", "contacts", "createdAt", "electricityLoad", "electricityLoadType", "kva", "leadId", "mobileNumber", "originalLeadData", "plantMachineryValue", "priority", "processStatus", "schemeType", "talukaCategory", "tenantId", "termLoanAmount", "updatedAt") SELECT "assignedProcessUserId", "assignedRole", "benefitTypes", "caseId", "caseNumber", "caseType", "clientName", "closedAt", "closureReason", "company", "consumerNumber", "contacts", "createdAt", "electricityLoad", "electricityLoadType", "kva", "leadId", "mobileNumber", "originalLeadData", "plantMachineryValue", "priority", "processStatus", "schemeType", "talukaCategory", "tenantId", "termLoanAmount", "updatedAt" FROM "cases";
DROP TABLE "cases";
ALTER TABLE "new_cases" RENAME TO "cases";
CREATE INDEX "cases_createdAt_idx" ON "cases"("createdAt");
CREATE INDEX "cases_tenantId_idx" ON "cases"("tenantId");
CREATE INDEX "cases_assignedProcessUserId_idx" ON "cases"("assignedProcessUserId");
CREATE INDEX "cases_processStatus_idx" ON "cases"("processStatus");
CREATE INDEX "cases_leadId_idx" ON "cases"("leadId");
CREATE TABLE "new_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 's3',
    "storagePath" TEXT NOT NULL,
    "storageUrl" TEXT,
    "encryptionKey" TEXT,
    "encryptionIV" TEXT,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "virusScanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "virusScanResult" TEXT,
    "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrText" TEXT,
    "uploadedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "currentVersionId" TEXT,
    "retentionPolicy" TEXT,
    "expiresAt" DATETIME,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_documents" ("caseId", "checksum", "createdAt", "currentVersionId", "deletedAt", "deletedById", "documentType", "encryptionIV", "encryptionKey", "expiresAt", "fileName", "fileSize", "id", "isDeleted", "mimeType", "notes", "ocrStatus", "ocrText", "rejectionReason", "retentionPolicy", "status", "storagePath", "storageProvider", "storageUrl", "tenantId", "updatedAt", "uploadedById", "verifiedAt", "verifiedById", "virusScanResult", "virusScanStatus") SELECT "caseId", "checksum", "createdAt", "currentVersionId", "deletedAt", "deletedById", "documentType", "encryptionIV", "encryptionKey", "expiresAt", "fileName", "fileSize", "id", "isDeleted", "mimeType", "notes", "ocrStatus", "ocrText", "rejectionReason", "retentionPolicy", "status", "storagePath", "storageProvider", "storageUrl", "tenantId", "updatedAt", "uploadedById", "verifiedAt", "verifiedById", "virusScanResult", "virusScanStatus" FROM "documents";
DROP TABLE "documents";
ALTER TABLE "new_documents" RENAME TO "documents";
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");
CREATE INDEX "documents_caseId_idx" ON "documents"("caseId");
CREATE INDEX "documents_uploadedById_idx" ON "documents"("uploadedById");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_virusScanStatus_idx" ON "documents"("virusScanStatus");
CREATE INDEX "documents_createdAt_idx" ON "documents"("createdAt");
CREATE TABLE "new_leads" (
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
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_leads" ("activities", "assignedAt", "assignedBy", "assignedToId", "budget", "clientName", "company", "companyLocation", "connectionDate", "consumerNumber", "contactOwner", "convertedAt", "convertedToCaseId", "createdAt", "createdById", "customFields", "discom", "documentStatus", "email", "finalConclusion", "followUpDate", "gidc", "gstNumber", "id", "isDeleted", "isDone", "isUpdated", "kva", "lastActivityDate", "mandateStatus", "marketingObjective", "mobileNumber", "mobileNumbers", "notes", "source", "status", "submitted_payload", "tenantId", "termLoan", "timeline", "unitType", "updatedAt") SELECT "activities", "assignedAt", "assignedBy", "assignedToId", "budget", "clientName", "company", "companyLocation", "connectionDate", "consumerNumber", "contactOwner", "convertedAt", "convertedToCaseId", "createdAt", "createdById", "customFields", "discom", "documentStatus", "email", "finalConclusion", "followUpDate", "gidc", "gstNumber", "id", "isDeleted", "isDone", "isUpdated", "kva", "lastActivityDate", "mandateStatus", "marketingObjective", "mobileNumber", "mobileNumbers", "notes", "source", "status", "submitted_payload", "tenantId", "termLoan", "timeline", "unitType", "updatedAt" FROM "leads";
DROP TABLE "leads";
ALTER TABLE "new_leads" RENAME TO "leads";
CREATE INDEX "leads_status_idx" ON "leads"("status");
CREATE INDEX "leads_assignedToId_idx" ON "leads"("assignedToId");
CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");
CREATE INDEX "leads_convertedToCaseId_idx" ON "leads"("convertedToCaseId");
CREATE INDEX "leads_isDeleted_idx" ON "leads"("isDeleted");
CREATE INDEX "leads_isDone_idx" ON "leads"("isDone");
CREATE INDEX "leads_lastActivityDate_idx" ON "leads"("lastActivityDate");
CREATE INDEX "leads_followUpDate_idx" ON "leads"("followUpDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_logs_key_key" ON "idempotency_logs"("key");

-- CreateIndex
CREATE INDEX "idempotency_logs_key_idx" ON "idempotency_logs"("key");

-- CreateIndex
CREATE INDEX "idempotency_logs_tenantId_idx" ON "idempotency_logs"("tenantId");

-- CreateIndex
CREATE INDEX "idempotency_logs_expiresAt_idx" ON "idempotency_logs"("expiresAt");
