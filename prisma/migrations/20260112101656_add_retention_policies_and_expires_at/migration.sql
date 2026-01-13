-- AlterTable
ALTER TABLE "documents" ADD COLUMN "expiresAt" DATETIME;

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "retentionPeriod" INTEGER NOT NULL,
    "retentionUnit" TEXT NOT NULL,
    "autoDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "retention_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "retention_policies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "retention_policies_tenantId_idx" ON "retention_policies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_tenantId_documentType_key" ON "retention_policies"("tenantId", "documentType");
