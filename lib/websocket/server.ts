/**
 * WebSocket Server Utilities
 * Provides real-time update capabilities for dashboards
 */

// Event types for real-time updates
export type WebSocketEventType =
    | 'lead_created'
    | 'lead_updated'
    | 'lead_deleted'
    | 'case_created'
    | 'case_updated'
    | 'case_deleted'
    | 'report_generated'
    | 'notification';

export interface WebSocketMessage {
    type: WebSocketEventType;
    tenantId: string;
    payload: any;
    timestamp: string;
}

// Connected clients by tenant
const clients: Map<string, Set<WebSocket>> = new Map();

/**
 * Register a client connection
 */
export function registerClient(tenantId: string, ws: WebSocket): void {
    if (!clients.has(tenantId)) {
        clients.set(tenantId, new Set());
    }
    clients.get(tenantId)!.add(ws);
}

/**
 * Unregister a client connection
 */
export function unregisterClient(tenantId: string, ws: WebSocket): void {
    const tenantClients = clients.get(tenantId);
    if (tenantClients) {
        tenantClients.delete(ws);
        if (tenantClients.size === 0) {
            clients.delete(tenantId);
        }
    }
}

/**
 * Broadcast message to all clients in a tenant
 */
export function broadcastToTenant(tenantId: string, message: WebSocketMessage): void {
    const tenantClients = clients.get(tenantId);
    if (!tenantClients) return;

    const messageStr = JSON.stringify(message);
    tenantClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
        }
    });
}

/**
 * Send message to specific client
 */
export function sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

/**
 * Get connected client count for a tenant
 */
export function getClientCount(tenantId: string): number {
    return clients.get(tenantId)?.size || 0;
}

/**
 * Emit lead created event
 */
export function emitLeadCreated(tenantId: string, lead: any): void {
    broadcastToTenant(tenantId, {
        type: 'lead_created',
        tenantId,
        payload: lead,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit lead updated event
 */
export function emitLeadUpdated(tenantId: string, lead: any): void {
    broadcastToTenant(tenantId, {
        type: 'lead_updated',
        tenantId,
        payload: lead,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit case created event
 */
export function emitCaseCreated(tenantId: string, caseData: any): void {
    broadcastToTenant(tenantId, {
        type: 'case_created',
        tenantId,
        payload: caseData,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit case updated event
 */
export function emitCaseUpdated(tenantId: string, caseData: any): void {
    broadcastToTenant(tenantId, {
        type: 'case_updated',
        tenantId,
        payload: caseData,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit report generated event
 */
export function emitReportGenerated(tenantId: string, reportInfo: any): void {
    broadcastToTenant(tenantId, {
        type: 'report_generated',
        tenantId,
        payload: reportInfo,
        timestamp: new Date().toISOString()
    });
}
