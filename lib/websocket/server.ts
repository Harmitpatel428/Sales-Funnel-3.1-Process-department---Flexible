import { getNextSequenceNumber, storeEvent, WebSocketEvent } from './eventLog';

// Connected clients by tenant
const clients: Map<string, Set<any>> = new Map();

/**
 * Register a client connection
 */
export function registerClient(tenantId: string, userId: string, socket: any): void {
    if (!clients.has(tenantId)) {
        clients.set(tenantId, new Set());
    }

    // We attach userId to the socket for presence tracking
    socket.userId = userId;
    clients.get(tenantId)!.add(socket);
}

/**
 * Unregister a client connection
 */
export function unregisterClient(tenantId: string, socket: any): void {
    clients.get(tenantId)?.delete(socket);
}

/**
 * Broadcast message to all clients in a tenant
 */
export function broadcastToTenant(tenantId: string, message: any): void {
    const tenantClients = clients.get(tenantId);
    if (!tenantClients) return;

    const data = JSON.stringify(message);
    tenantClients.forEach(socket => {
        if (socket.readyState === 1) { // WebSocket.OPEN
            socket.send(data);
        }
    });
}

// Entity Emitters

export async function emitLeadCreated(tenantId: string, lead: any): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'lead_created',
        tenantId,
        payload: lead,
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitLeadUpdated(tenantId: string, lead: any): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'lead_updated',
        tenantId,
        payload: lead,
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitLeadDeleted(tenantId: string, leadId: string): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'lead_deleted',
        tenantId,
        payload: { leadId },
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitCaseCreated(tenantId: string, caseData: any): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'case_created',
        tenantId,
        payload: caseData,
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitCaseUpdated(tenantId: string, caseData: any): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'case_updated',
        tenantId,
        payload: caseData,
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitCaseDeleted(tenantId: string, caseId: string): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'case_deleted',
        tenantId,
        payload: { caseId },
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitDocumentCreated(tenantId: string, document: any): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'document_created',
        tenantId,
        payload: document,
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitDocumentUpdated(tenantId: string, document: any): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'document_updated',
        tenantId,
        payload: document,
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}

export async function emitDocumentDeleted(tenantId: string, documentId: string): Promise<void> {
    const sequenceNumber = await getNextSequenceNumber(tenantId);
    const event: WebSocketEvent = {
        id: crypto.randomUUID(),
        sequenceNumber,
        eventType: 'document_deleted',
        tenantId,
        payload: { documentId },
        timestamp: new Date().toISOString(),
    };

    await storeEvent(event);
    broadcastToTenant(tenantId, event);
}
