'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { useDocuments } from '../context/DocumentContext';
import { useTimeline } from '../context/TimelineContext';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';
import CaseStatusBadge, { STATUS_ORDER, getStatusConfig } from '../components/CaseStatusBadge';
import DocumentUploader from '../components/DocumentUploader';
import CaseTimeline from '../components/CaseTimeline';
import { ProcessStatus } from '../types/processTypes';

function CaseDetailContent() {
    const searchParams = useSearchParams();
    const caseId = searchParams.get('id') || '';
    const router = useRouter();

    const { getCaseById, updateStatus, updateCase } = useCases();
    const { currentUser } = useUsers();
    const { getDocumentsByCaseId } = useDocuments();
    const { logStatusChange, addTimelineEntry } = useTimeline();

    const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'timeline' | 'notes'>('overview');
    const [loading, setLoading] = useState(true);
    const [caseData, setCaseData] = useState<any>(null);
    const [notes, setNotes] = useState<any[]>([]);
    const [newNote, setNewNote] = useState('');

    // Load case data
    useEffect(() => {
        if (caseId) {
            const data = getCaseById(caseId);
            if (data) {
                setCaseData(data);
                // Load notes from localStorage
                try {
                    const savedNotes = localStorage.getItem('caseNotes');
                    if (savedNotes) {
                        const allNotes = JSON.parse(savedNotes);
                        setNotes(allNotes.filter((n: any) => n.caseId === caseId));
                    }
                } catch (e) {
                    console.error('Failed to load notes', e);
                }
            }
            setLoading(false);
        } else {
            // Handle missing ID
            setLoading(false);
        }
    }, [caseId, getCaseById]);

    // Handle status change
    const handleStatusChange = (newStatus: ProcessStatus) => {
        if (!caseData || !currentUser) return;

        // Check permission logic here if stricter content needed

        const result = updateStatus(caseId, newStatus);
        if (result.success) {
            logStatusChange(caseId, caseData.processStatus, newStatus, currentUser.userId, currentUser.name);

            // Update local state
            setCaseData({ ...caseData, processStatus: newStatus, updatedAt: new Date().toISOString() });
        } else {
            alert(result.message);
        }
    };

    // Check if electron is available
    const isElectron = typeof window !== 'undefined' && !!window.electron;

    // Handle view document
    const handleViewDocument = async (doc: any) => {
        if (isElectron && doc.filePath) {
            try {
                // If it's an absolute path or starts with data/, use Electron to open
                const result = await window.electron.readFile(doc.filePath);
                if (result.success) {
                    // Create blob and open in new tab
                    const byteCharacters = atob(result.data.split(',')[1]);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: doc.mimeType || 'application/pdf' });
                    const fileURL = URL.createObjectURL(blob);
                    window.open(fileURL, '_blank');
                } else {
                    alert(`Failed to open file: ${result.error}`);
                }
            } catch (error) {
                console.error('Error opening file:', error);
                alert('An error occurred while opening the file.');
            }
        } else {
            console.warn('View not available in browser mode or missing path');
            alert('View feature requires Electron environment.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (!caseData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <h2 className="text-xl font-bold text-gray-700">Case not found</h2>
                <button
                    onClick={() => router.push('/cases')}
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                    Back to Cases
                </button>
            </div>
        );
    }

    const documents = getDocumentsByCaseId(caseId);

    return (
        <RoleGuard
            allowedRoles={['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE', 'SALES']}
            fallback={<AccessDenied />}
        >
            <div className="h-screen flex flex-col bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 shadow-sm z-10 px-6 py-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.back()}
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>

                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold text-gray-900">{caseData.caseNumber}</h1>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${caseData.priority === 'URGENT' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}>
                                        {caseData.priority}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500">{caseData.clientName} • {caseData.schemeType}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <CaseStatusBadge status={caseData.processStatus} size="lg" />

                            {/* Status Change Dropdown (Only for process roles) */}
                            {['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE'].includes(currentUser?.role || '') && (
                                <div className="relative group">
                                    <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                        Update Status
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-100 hidden group-hover:block z-50">
                                        <div className="py-1">
                                            {STATUS_ORDER.map(status => (
                                                <button
                                                    key={status}
                                                    onClick={() => handleStatusChange(status)}
                                                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${caseData.processStatus === status ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700'
                                                        }`}
                                                >
                                                    {getStatusConfig(status).label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-6 mt-6 border-b border-gray-200 -mb-4">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`pb-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'overview' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={`pb-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'documents' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Documents
                            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                                {documents.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('timeline')}
                            className={`pb-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'timeline' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Timeline
                        </button>
                        <button
                            onClick={() => setActiveTab('notes')}
                            className={`pb-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notes' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Notes
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-6xl mx-auto">

                        {/* OVERVIEW TAB */}
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 space-y-6">
                                    {/* Client Details Card */}
                                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Client Information</h3>
                                        <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                            <div>
                                                <p className="text-sm text-gray-500">Client Name</p>
                                                <p className="font-medium text-gray-900">{caseData.clientName}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Company</p>
                                                <p className="font-medium text-gray-900">{caseData.company || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Mobile Number</p>
                                                <p className="font-medium text-gray-900">{caseData.mobileNumber || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Consumer Number</p>
                                                <p className="font-medium text-gray-900">{caseData.consumerNumber || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">KVA</p>
                                                <p className="font-medium text-gray-900">{caseData.kva || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Scheme Type</p>
                                                <p className="font-medium text-gray-900">{caseData.schemeType}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Process Status Card */}
                                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Process Status</h3>
                                        <div className="relative">
                                            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 rounded-full -z-10"></div>
                                            <div className="flex justify-between">
                                                {/* Simple visual pipeline (showing first, current, last) */}
                                                <div className={`flex flex-col items-center gap-2 ${STATUS_ORDER.indexOf(caseData.processStatus) >= 0 ? 'opacity-100' : 'opacity-40'}`}>
                                                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                                                    <span className="text-xs font-medium text-gray-600">Start</span>
                                                </div>
                                                <div className={`flex flex-col items-center gap-2 opacity-100`}>
                                                    <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                        </svg>
                                                    </div>
                                                    <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{getStatusConfig(caseData.processStatus).label}</span>
                                                </div>
                                                <div className={`flex flex-col items-center gap-2 ${caseData.processStatus === 'CLOSED' ? 'opacity-100' : 'opacity-40'}`}>
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold">End</div>
                                                    <span className="text-xs font-medium text-gray-600">Closed</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sidebar */}
                                <div className="space-y-6">
                                    {/* System Info */}
                                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">System Info</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-500">Case ID</span>
                                                <span className="text-gray-900 font-mono text-xs">{caseData.caseId.substring(0, 8)}...</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-500">Created At</span>
                                                <span className="text-gray-900">{new Date(caseData.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-500">Last Updated</span>
                                                <span className="text-gray-900">{new Date(caseData.updatedAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="pt-2 border-t border-gray-100 flex justify-between text-sm items-center">
                                                <span className="text-gray-500">Assigned To</span>
                                                <span className="flex items-center gap-1.5 text-gray-900 bg-gray-50 px-2 py-1 rounded">
                                                    <div className="w-4 h-4 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold">
                                                        {(caseData.assignedProcessUserId || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    {caseData.assignedProcessUserId ? 'User' : 'Unassigned'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* DOCUMENTS TAB */}
                        {activeTab === 'documents' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-1">
                                    <DocumentUploader caseId={caseId} schemeType={caseData.schemeType} />
                                </div>

                                <div className="lg:col-span-2">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Uploaded Documents ({documents.length})</h3>

                                    {documents.length > 0 ? (
                                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                            {documents.map((doc) => (
                                                <div key={doc.documentId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900">{doc.documentType}</p>
                                                            <p className="text-xs text-gray-500">{doc.fileName} • {(doc.fileSize ? (doc.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown size')}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium border ${doc.status === 'VERIFIED' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            doc.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                            {doc.status}
                                                        </span>

                                                        {/* Actions Button */}
                                                        <button
                                                            onClick={() => handleViewDocument(doc)}
                                                            className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                                                            title="View Document"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 rounded-xl border border-gray-200 border-dashed p-10 text-center">
                                            <p className="text-gray-500">No documents uploaded yet.</p>
                                            <button
                                                onClick={() => { }} // Focus upload area
                                                className="text-purple-600 font-medium text-sm mt-2 hover:underline"
                                            >
                                                Upload your first document
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TIMELINE TAB */}
                        {activeTab === 'timeline' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm max-w-3xl mx-auto">
                                <h3 className="text-lg font-semibold text-gray-900 mb-6">Case Activity</h3>
                                <CaseTimeline caseId={caseId} />
                            </div>
                        )}

                        {/* NOTES TAB */}
                        {activeTab === 'notes' && (
                            <div className="max-w-3xl mx-auto space-y-6">
                                {/* Add Note */}
                                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Note</h3>
                                    <div className="space-y-4">
                                        <textarea
                                            value={newNote}
                                            onChange={(e) => setNewNote(e.target.value)}
                                            placeholder="Type your note here..."
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[100px] text-black placeholder-black"
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => {
                                                    if (!newNote.trim() || !currentUser) return;

                                                    const note = {
                                                        noteId: Date.now().toString(),
                                                        caseId: caseId,
                                                        content: newNote,
                                                        visibility: 'INTERNAL',
                                                        createdBy: currentUser.userId,
                                                        createdByName: currentUser.name,
                                                        createdAt: new Date().toISOString()
                                                    };

                                                    const updatedNotes = [note, ...notes];
                                                    setNotes(updatedNotes);

                                                    // Save to localStorage
                                                    try {
                                                        const savedNotes = localStorage.getItem('caseNotes');
                                                        const allNotes = savedNotes ? JSON.parse(savedNotes) : [];
                                                        allNotes.push(note);
                                                        localStorage.setItem('caseNotes', JSON.stringify(allNotes));
                                                    } catch (e) {
                                                        console.error('Failed to save note', e);
                                                    }

                                                    setNewNote('');
                                                    // Use addTimelineEntry for generic actions
                                                    addTimelineEntry({
                                                        caseId,
                                                        actionType: 'NOTE_ADDED',
                                                        action: 'Added a note',
                                                        performedBy: currentUser.userId,
                                                        performedByName: currentUser.name,
                                                        metadata: { noteId: note.noteId }
                                                    });
                                                }}
                                                disabled={!newNote.trim()}
                                                className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Add Note
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes List */}
                                <div className="space-y-4">
                                    {notes.length > 0 ? (
                                        notes.map((note) => (
                                            <div key={note.noteId} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                                            {note.createdByName ? note.createdByName.charAt(0).toUpperCase() : 'U'}
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-semibold text-gray-900 block">{note.createdByName || 'Unknown User'}</span>
                                                            <span className="text-xs text-gray-500">{new Date(note.createdAt).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                        {note.visibility}
                                                    </span>
                                                </div>
                                                <div className="text-gray-700 text-sm whitespace-pre-wrap pl-10">
                                                    {note.content}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                                            <p className="text-gray-500 text-sm">No notes added yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}

export default function CaseDetailPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        }>
            <CaseDetailContent />
        </Suspense>
    );
}
