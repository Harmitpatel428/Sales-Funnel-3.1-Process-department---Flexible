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
 * - SUPER_ADMIN: Full system access, can switch between tenants, manage all tenants
 * - ADMIN: Full access within tenant, user management, system configuration
 * - SALES_EXECUTIVE: Can create/manage assigned leads only, convert to cases, view case status (read-only)
 * - SALES_MANAGER: Can view/manage all leads, reassign leads, approve case conversions, access full sales analytics
 * - PROCESS_EXECUTIVE: Can manage assigned cases, upload/verify docs, update status
 * - PROCESS_MANAGER: Can view/manage all cases, view reports, reassign cases
 */
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES_EXECUTIVE' | 'SALES_MANAGER' | 'PROCESS_EXECUTIVE' | 'PROCESS_MANAGER';

/**
 * User interface for authentication and authorization
 */
export interface User {
    userId: string;
    username: string;
    name: string;
    email: string;
    role: UserRole;
    password: string; // Stored encrypted (hashed)
    plainPassword?: string; // Plain text password for admin display (in-memory only)
    isActive: boolean;
    createdAt: string;
    lastLoginAt?: string;
    lastResetAt?: string; // Timestamp of last password reset
    passwordHistory?: PasswordHistoryEntry[]; // History of password changes
    permissions?: string[]; // RBAC permissions
    roleId?: string | null; // Custom Role ID
    customRole?: {
        id: string;
        name: string;
    } | null;
    mfaEnabled?: boolean;
    ssoProvider?: 'google' | 'microsoft' | 'saml' | null;
}

/**
 * Password history entry for admin tracking
 */
export interface PasswordHistoryEntry {
    timestamp: string;
    oldPassword: string;    // Plain text for admin display
    newPassword: string;    // Plain text for admin display
    changedBy: string;      // User ID who made the change
    changedByName: string;  // User name for display
    type: 'SELF' | 'ADMIN_RESET';
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
    permissions?: string[];
    roleId?: string | null;
    customRole?: {
        id: string;
        name: string;
    } | null;
    mfaEnabled?: boolean;
    ssoProvider?: 'google' | 'microsoft' | 'saml' | null;
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
 * 
 * NOTE: For cases created after 2026-01-06, the benefitTypes array contains exactly one benefit type.
 * Multiple benefit types selected during lead conversion result in multiple separate case entries.
 * Legacy cases may still contain multiple benefit types in the array.
 */
export interface Case {
    caseId: string;
    leadId: string;                    // Reference to original lead (immutable)
    caseNumber: string;                // Human-readable case number (e.g., "CASE-2026-0001")
    schemeType: string;                // Type of government scheme/subsidy (Policy Type)
    caseType?: string;                 // New, Expansion, Shifting, etc.
    benefitTypes?: string[];           // Single benefit type for new cases (one per case)
    companyType?: string;              // Limited, Pvt Limited, Partnership, etc.
    assignedProcessUserId: string | null;
    assignedRole: UserRole | null;         // Role assigned to handle this case
    processStatus: ProcessStatus;
    priority: CasePriority;
    createdAt: string;
    updatedAt: string;
    closedAt?: string;
    closureReason?: string;
    originalLeadData?: Record<string, any>; // Full lead data snapshot including submitted_payload

    // Denormalized lead info for display (copied at conversion time)
    clientName: string;
    company: string;
    mobileNumber: string;
    consumerNumber?: string;
    kva?: string;

    // Contact persons from forwarding form
    contacts?: Array<{
        name: string;
        designation: string;
        customDesignation?: string;
        phoneNumber: string;
    }>;

    // Financial/Location fields from Forward to Process form
    talukaCategory?: string;
    termLoanAmount?: string;
    plantMachineryValue?: string;
    electricityLoad?: string;
    electricityLoadType?: 'HT' | 'LT' | '';
}

/**
 * Case Assignment History - tracks all assignment changes for audit
 */
export interface CaseAssignmentHistory {
    historyId: string;
    caseId: string;
    previousRole: UserRole | null;
    previousUserId: string | null;
    newRole: UserRole | null;
    newUserId: string | null;
    assignedBy: string;
    assignedByName: string;
    assignedAt: string;
    remarks?: string;
}

/**
 * Result of bulk assignment operation
 */
export interface BulkAssignmentResult {
    success: boolean;
    message: string;
    count: number;
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
    fileData?: string;                 // Base64 data URL for browser preview
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
    resetUserPassword: (userId: string) => { success: boolean; newPassword?: string; message: string };
    changeOwnPassword: (currentPassword: string, newPassword: string) => { success: boolean; message: string };
    getUserById: (userId: string) => User | undefined;
    getUsersByRole: (role: UserRole) => User[];

    // Impersonation support
    overrideCurrentUser: (user: UserSession | null) => void;

    // Permission checks
    hasRole: (roles: UserRole[]) => boolean;
    canManageLeads: () => boolean;
    canConvertToCase: () => boolean;
    canManageCases: () => boolean;
    canViewAllCases: () => boolean;
    canManageUsers: () => boolean;
    canViewReports: () => boolean;
    canViewAllLeads: () => boolean;
    canAssignLeads: () => boolean;
    canReassignLeads: () => boolean;
    canAccessSalesDashboard: () => boolean;
    canAccessProcessDashboard: () => boolean;
    canDeleteLeads: () => boolean;
    canAssignBenefitTypes: () => boolean;
}

/**
 * Case context type interface
 */
export interface CaseContextType {
    cases: Case[];
    isLoading: boolean;

    // Case CRUD
    createCase: (leadId: string, schemeType: string, metadata?: {
        caseType?: string;
        benefitTypes?: string[];
        companyName?: string;
        companyType?: string;
        contacts?: Array<{
            name: string;
            designation: string;
            customDesignation?: string;
            phoneNumber: string;
        }>;
        // Financial/Location fields
        talukaCategory?: string;
        termLoanAmount?: string;
        plantMachineryValue?: string;
        electricityLoad?: string;
        electricityLoadType?: 'HT' | 'LT' | '';
    }) => Promise<{ success: boolean; message: string; caseIds?: string[] }>;
    updateCase: (caseId: string, updates: Partial<Case>) => Promise<{ success: boolean; message: string }>;
    deleteCase: (caseId: string) => Promise<{ success: boolean; message: string }>;
    getCaseById: (caseId: string) => Case | undefined;
    getCaseByLeadId: (leadId: string) => Case | undefined;

    // Status operations
    updateStatus: (caseId: string, newStatus: ProcessStatus) => Promise<{ success: boolean; message: string }>;

    // Assignment operations
    assignCase: (caseId: string, userId: string, roleId?: UserRole) => Promise<{ success: boolean; message: string }>;
    bulkAssignCases: (caseIds: string[], userId: string, roleId?: UserRole) => Promise<BulkAssignmentResult>;


    // Filtering
    getFilteredCases: (filters: CaseFilters) => Case[];
    getCasesByStatus: (status: ProcessStatus) => Case[];
    getCasesByAssignee: (userId: string) => Case[];
    getCasesByAssigneeFiltered: (userId: string) => Case[];

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
    logAssignment: (caseId: string, userId: string, userName: string, assigneeId: string, assigneeName: string, roleId?: UserRole) => void;
    logDocumentAction: (caseId: string, action: TimelineActionType, documentType: string, userId: string, userName: string) => void;
}
