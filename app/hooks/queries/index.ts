/**
 * Query Hooks Index
 * 
 * Re-exports all query hooks for convenient importing
 */

// Leads
export {
    useLeadsQuery,
    useLeadQuery,
    useLeadActivitiesQuery,
    leadKeys,
} from './useLeadsQuery';

// Cases
export {
    useCasesQuery,
    useCaseQuery,
    useCaseByLeadQuery,
    useCaseStatsQuery,
    caseKeys,
} from './useCasesQuery';

// Documents
export {
    useDocumentsQuery,
    useDocumentsByCaseQuery,
    useDocumentQuery,
    documentKeys,
} from './useDocumentsQuery';
