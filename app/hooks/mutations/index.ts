/**
 * Mutation Hooks Index
 * 
 * Re-exports all mutation hooks for convenient importing
 */

// Leads
export {
    useCreateLeadMutation,
    useUpdateLeadMutation,
    useDeleteLeadMutation,
    useAssignLeadMutation,
    useUnassignLeadMutation,
    useForwardLeadMutation,
    useAddLeadActivityMutation,
    useMarkLeadDoneMutation,
    useBulkImportMutation,
} from './useLeadsMutations';

// Cases
export {
    useCreateCaseMutation,
    useUpdateCaseMutation,
    useDeleteCaseMutation,
    useUpdateCaseStatusMutation,
    useAssignCaseMutation,
    useBulkAssignCasesMutation,
} from './useCasesMutations';

// Documents
export {
    useUploadDocumentMutation,
    useUpdateDocumentMutation,
    useDeleteDocumentMutation,
    useVerifyDocumentMutation,
    useRejectDocumentMutation,
} from './useDocumentsMutations';
