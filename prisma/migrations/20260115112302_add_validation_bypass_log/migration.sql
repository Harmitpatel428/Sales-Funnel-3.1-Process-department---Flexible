-- CreateTable
CREATE TABLE "validation_bypass_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "validation_bypass_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "validation_bypass_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "validation_bypass_logs_token_key" ON "validation_bypass_logs"("token");

-- CreateIndex
CREATE INDEX "validation_bypass_logs_tenantId_idx" ON "validation_bypass_logs"("tenantId");

-- CreateIndex
CREATE INDEX "validation_bypass_logs_userId_idx" ON "validation_bypass_logs"("userId");

-- CreateIndex
CREATE INDEX "validation_bypass_logs_token_idx" ON "validation_bypass_logs"("token");
