-- CreateTable
CREATE TABLE "websocket_event_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "websocket_event_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "websocket_event_logs_eventId_key" ON "websocket_event_logs"("eventId");

-- CreateIndex
CREATE INDEX "websocket_event_logs_tenantId_sequenceNumber_idx" ON "websocket_event_logs"("tenantId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "websocket_event_logs_expiresAt_idx" ON "websocket_event_logs"("expiresAt");
