/**
 * Process Management System Types
 * 
 * This file contains all types related to the Process Management module:
 * - User roles and authentication
 * - Cases (distinct from Leads)
 * - Documents, Notes, Tasks
 * - Timeline/Audit logging
 */

// ============================================================================
// ROLE & USER TYPES
// ============================================================================

/**
 * User roles for role-based access control
 * - ADMIN: Full access, user management, system configuration
 * - SALES: Can create/manage leads, convert to cases, view case status (read-only)
 * - PROCESS_EXECUTIVE: Can manage assigned cases, upload/verify docs, update status
 * - PROCESS_MANAGER: Can view/manage all cases, view reports, reassign cases
 */
export type UserRole = 'ADMIN' | 'SALES' | 'PROCESS_EXECUTIVE' | 'PROCESS_MANAGER';

/**
 * User interface for authentication and authorization
 */
export interface User {
    userId: string;
    username: string;
    name: string;
    email: string;
    role: UserRole;
    password: string; // Stored encrypted
    isActive: boolean;
    createdAt: string;
    lastLoginAt?: string;
}

/**
 * Current user session (without password)
 */
export interface UserSession {
    userId: string;
    username: string;
    name: string;
    email: string;
    role: UserRole;
    loginAt: string;
}

// ============================================================================
// PROCESS STATUS TYPES
// ============================================================================

/**
 * Process status enum - fixed values, no free text
 * Represents the lifecycle of a case from document collection to closure
 */
export type ProcessStatus =
    | 'DOCUMENTS_PENDING'   // Initial state - waiting for documents
    | 'DOCUMENTS_RECEIVED'  // All required documents received
    | 'VERIFICATION'        // Documents being verified
    | 'SUBMITTED'           // Submitted to government authority
    | 'QUERY_RAISED'        // Authority has raised queries
    | 'APPROVED'            // Application approved
    | 'REJECTED'            // Application rejected
    | 'CLOSED';             // Case closed (after final outcome)

/**
 * Document status enum
 */
export type DocumentStatus = 'PENDING' | 'RECEIVED' | 'VERIFIED' | 'REJECTED';

/**
 * Note visibility enum
 */
export type NoteVisibility = 'INTERNAL' | 'SHARED';

/**
 * Case priority levels
 */
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// ============================================================================
// CASE TYPES
// ============================================================================

/**
 * Case interface - represents a process case (distinct from Lead)
 * Created when a Lead is converted to a Case
 */
export interface Case {
    caseId: string;
    leadId: string;                    // Reference to original lead (immutable)
    caseNumber: string;                // Human-readable case number (e.g., "CASE-2026-0001")
    schemeType: string;                // Type of government scheme/subsidy
    assignedProcessUserId: string | null;
    processStatus: ProcessStatus;
    priority: CasePriority;
    createdAt: string;
    updatedAt: string;
    closedAt?: string;
    closureReason?: string;

    // Denormalized lead info for display (copied at conversion time)
    clientName: string;
    company: string;
    mobileNumber: string;
    consumerNumber?: string;
    kva?: string;
}

/**
 * Case filters for querying
 */
export interface CaseFilters {
    status?: ProcessStatus[];
    assignedTo?: string;
    priority?: CasePriority[];
    schemeType?: string;
    searchTerm?: string;
    dateRangeStart?: string;
    dateRangeEnd?: string;
}

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Required document types for government schemes
 */
export const REQUIRED_DOCUMENT_TYPES = [
    'ID Proof',
    'Address Proof',
    'GST Certificate',
    'Company Registration',
    'Electricity Bill',
    'Bank Statement',
    'Project Report',
    'Land Documents',
    'Application Form',
    'Other'
] as const;

export type RequiredDocumentType = typeof REQUIRED_DOCUMENT_TYPES[number];

/**
 * Case Document interface
 */
export interface CaseDocument {
    documentId: string;
    caseId: string;
    documentType: string;              // e.g., "ID Proof", "GST Certificate"
    fileName: string;
    filePath: string;                  // data/cases/{caseId}/documents/{fileName}
    fileSize?: number;                 // Size in bytes
    mimeType?: string;
    status: DocumentStatus;
    uploadedAt: string;
    uploadedBy: string;                // User ID
    verifiedAt?: string;
    verifiedBy?: string;               // User ID
    rejectionReason?: string;
    notes?: string;
}

// ============================================================================
// NOTE TYPES
// ============================================================================

/**
 * Case Note interface
 */
export interface CaseNote {
    noteId: string;
    caseId: string;
    content: string;
    visibility: NoteVisibility;        // INTERNAL = only process team, SHARED = visible to all
    createdBy: string;                 // User ID
    createdByName: string;             // User name for display
    createdAt: string;
    updatedAt?: string;
}

// ============================================================================
// TASK TYPES
// ============================================================================

/**
 * Case Task interface
 */
export interface CaseTask {
    taskId: string;
    caseId: string;
    title: string;
    description?: string;
    assignedTo: string;                // User ID
    assignedToName: string;            // User name for display
    completed: boolean;
    completedAt?: string;
    completedBy?: string;              // User ID
    dueDate?: string;
    priority: CasePriority;
    createdBy: string;                 // User ID
    createdAt: string;
}

// ============================================================================
// TIMELINE TYPES
// ============================================================================

/**
 * Timeline action types for audit logging
 */
export type TimelineActionType =
    | 'CASE_CREATED'
    | 'STATUS_CHANGED'
    | 'ASSIGNED'
    | 'REASSIGNED'
    | 'DOCUMENT_UPLOADED'
    | 'DOCUMENT_VERIFIED'
    | 'DOCUMENT_REJECTED'
    | 'NOTE_ADDED'
    | 'TASK_CREATED'
    | 'TASK_COMPLETED'
    | 'PRIORITY_CHANGED'
    | 'CASE_CLOSED'
    | 'CASE_REOPENED';

/**
 * Case Timeline entry (audit log)
 */
export interface CaseTimelineEntry {
    entryId: string;
    caseId: string;
    actionType: TimelineActionType;
    action: string;                    // Human-readable description
    performedBy: string;               // User ID
    performedByName: string;           // User name for display
    performedAt: string;
    metadata?: Record<string, any>;    // Additional context (e.g., old/new status)
}

// ============================================================================
// SCHEME TYPES
// ============================================================================

/**
 * Government scheme types
 */
export const SCHEME_TYPES = [
    'Solar Rooftop Subsidy',
    'Industrial Promotion Subsidy',
    'MSME Subsidy',
    'Agriculture Subsidy',
    'Startup Gujarat',
    'Power Tariff Subsidy',
    'Interest Subsidy',
    'Capital Investment Subsidy',
    'Other'
] as const;

export type SchemeType = typeof SCHEME_TYPES[number];

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * User context type interface
 */
export interface UserContextType {
    currentUser: UserSession | null;
    users: User[];
    isAuthenticated: boolean;
    isLoading: boolean;

    // Auth operations
    login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
    logout: () => void;

    // User CRUD (ADMIN only)
    createUser: (user: Omit<User, 'userId' | 'createdAt'>) => { success: boolean; message: string };
    updateUser: (userId: string, updates: Partial<User>) => { success: boolean; message: string };
    deleteUser: (userId: string) => { success: boolean; message: string };
    getUserById: (userId: string) => User | undefined;
    getUsersByRole: (role: UserRole) => User[];

    // Permission checks
    hasRole: (roles: UserRole[]) => boolean;
    canManageLeads: () => boolean;
    canConvertToCase: () => boolean;
    canManageCases: () => boolean;
    canViewAllCases: () => boolean;
    canManageUsers: () => boolean;
    canViewReports: () => boolean;
}

/**
 * Case context type interface
 */
export interface CaseContextType {
    cases: Case[];
    isLoading: boolean;

    // Case CRUD
    createCase: (leadId: string, schemeType: string) => { success: boolean; message: string; caseId?: string };
    updateCase: (caseId: string, updates: Partial<Case>) => { success: boolean; message: string };
    deleteCase: (caseId: string) => { success: boolean; message: string };
    getCaseById: (caseId: string) => Case | undefined;
    getCaseByLeadId: (leadId: string) => Case | undefined;

    // Status operations
    updateStatus: (caseId: string, newStatus: ProcessStatus) => { success: boolean; message: string };

    // Assignment operations
    assignCase: (caseId: string, userId: string) => { success: boolean; message: string };

    // Filtering
    getFilteredCases: (filters: CaseFilters) => Case[];
    getCasesByStatus: (status: ProcessStatus) => Case[];
    getCasesByAssignee: (userId: string) => Case[];

    // Statistics
    getCaseStats: () => {
        total: number;
        byStatus: Record<ProcessStatus, number>;
        byPriority: Record<CasePriority, number>;
    };
}

/**
 * Document context type interface
 */
export interface DocumentContextType {
    documents: CaseDocument[];

    // Document operations
    addDocument: (doc: Omit<CaseDocument, 'documentId' | 'uploadedAt'>) => { success: boolean; message: string };
    updateDocument: (documentId: string, updates: Partial<CaseDocument>) => { success: boolean; message: string };
    deleteDocument: (documentId: string) => { success: boolean; message: string };

    // Status operations
    verifyDocument: (documentId: string, userId: string) => { success: boolean; message: string };
    rejectDocument: (documentId: string, userId: string, reason: string) => { success: boolean; message: string };

    // Queries
    getDocumentsByCaseId: (caseId: string) => CaseDocument[];
    getDocumentsByStatus: (caseId: string, status: DocumentStatus) => CaseDocument[];
}

/**
 * Timeline context type interface
 */
export interface TimelineContextType {
    // Add entry
    addTimelineEntry: (entry: Omit<CaseTimelineEntry, 'entryId' | 'performedAt'>) => void;

    // Queries
    getTimelineByCaseId: (caseId: string) => CaseTimelineEntry[];

    // Utility to log common actions
    logStatusChange: (caseId: string, oldStatus: ProcessStatus, newStatus: ProcessStatus, userId: string, userName: string) => void;
    logAssignment: (caseId: string, userId: string, userName: string, assigneeId: string, assigneeName: string) => void;
    logDocumentAction: (caseId: string, action: TimelineActionType, documentType: string, userId: string, userName: string) => void;
}
