'use client';

/**
 * Approvals Dashboard Page
 */

import { useState, useEffect } from 'react';

interface ApprovalRequest {
    id: string;
    entityType: string;
    entityId: string;
    status: string;
    approvalType: string;
    requestedAt: string;
    expiresAt?: string;
    requestedBy: { id: string; name: string };
    workflowExecution?: { workflow?: { name: string } };
    metadata: string;
}

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
    const [comments, setComments] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchApprovals();
    }, []);

    const fetchApprovals = async () => {
        try {
            const res = await fetch('/api/approvals');
            const data = await res.json();
            setApprovals(data.approvals || []);
        } catch (error) {
            console.error('Failed to fetch approvals:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApproval = async (action: 'approve' | 'reject') => {
        if (!selectedApproval) return;
        setProcessing(true);
        try {
            await fetch(`/api/approvals/${selectedApproval.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, comments })
            });
            setSelectedApproval(null);
            setComments('');
            fetchApprovals();
        } catch (error) {
            console.error('Failed to process approval:', error);
        } finally {
            setProcessing(false);
        }
    };

    const formatDate = (date: string) => new Date(date).toLocaleString();

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Pending Approvals</h1>

            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : approvals.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                    No pending approvals
                </div>
            ) : (
                <div className="space-y-4">
                    {approvals.map((approval) => (
                        <div key={approval.id} className="bg-white rounded-lg shadow p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-medium text-gray-900">
                                        {approval.workflowExecution?.workflow?.name || 'Workflow Approval'}
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {approval.entityType} {approval.entityId}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        Requested by {approval.requestedBy.name} on {formatDate(approval.requestedAt)}
                                    </div>
                                    {approval.expiresAt && (
                                        <div className="text-sm text-orange-600">
                                            Expires: {formatDate(approval.expiresAt)}
                                        </div>
                                    )}
                                </div>
                                <span className={`px-2 py-1 text-xs rounded-full ${approval.approvalType === 'ANY' ? 'bg-blue-100 text-blue-800' :
                                        approval.approvalType === 'ALL' ? 'bg-purple-100 text-purple-800' :
                                            'bg-gray-100 text-gray-800'
                                    }`}>
                                    {approval.approvalType}
                                </span>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={() => setSelectedApproval(approval)}
                                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
                                >
                                    Review
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Review Modal */}
            {selectedApproval && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-medium mb-4">Review Approval</h2>
                        <div className="mb-4">
                            <div className="text-sm text-gray-600">Workflow</div>
                            <div className="font-medium">{selectedApproval.workflowExecution?.workflow?.name}</div>
                        </div>
                        <div className="mb-4">
                            <div className="text-sm text-gray-600">Entity</div>
                            <div>{selectedApproval.entityType} - {selectedApproval.entityId}</div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm text-gray-600 mb-1">Comments</label>
                            <textarea
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                rows={3}
                                className="w-full border rounded px-3 py-2"
                                placeholder="Optional comments..."
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setSelectedApproval(null)} className="px-4 py-2 border rounded">
                                Cancel
                            </button>
                            <button
                                onClick={() => handleApproval('reject')}
                                disabled={processing}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                                Reject
                            </button>
                            <button
                                onClick={() => handleApproval('approve')}
                                disabled={processing}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                                Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
