'use client';

/**
 * Visual Workflow Builder Page
 * Drag-and-drop interface for creating workflows
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface WorkflowStep {
    id: string;
    stepType: 'CONDITION' | 'ACTION';
    stepOrder: number;
    actionType?: string;
    actionConfig: Record<string, unknown>;
    conditionType?: string;
    conditionConfig: Record<string, unknown>;
}

interface Workflow {
    name: string;
    description: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    entityType: string;
    priority: number;
    steps: WorkflowStep[];
}

const actionTypes = [

    { value: 'ASSIGN_USER', label: 'Assign User', icon: '👤' },
    { value: 'UPDATE_FIELD', label: 'Update Field', icon: '✏️' },
    { value: 'CREATE_TASK', label: 'Create Task', icon: '📝' },
    { value: 'WEBHOOK', label: 'Webhook', icon: '🔗' },
    { value: 'WAIT', label: 'Wait', icon: '⏰' },
    { value: 'APPROVAL', label: 'Request Approval', icon: '✅' },
    { value: 'UPDATE_LEAD_SCORE', label: 'Update Lead Score', icon: '📊' },
    { value: 'ESCALATE', label: 'Escalate', icon: '🚨' }
];

const triggerTypes = [
    { value: 'ON_CREATE', label: 'When Created' },
    { value: 'ON_UPDATE', label: 'When Updated' },
    { value: 'ON_STATUS_CHANGE', label: 'When Status Changes' },
    { value: 'SCHEDULED', label: 'On Schedule' },
    { value: 'MANUAL', label: 'Manual Trigger' }
];

export default function WorkflowBuilderPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const workflowId = searchParams.get('id');

    const [workflow, setWorkflow] = useState<Workflow>({
        name: '',
        description: '',
        triggerType: 'ON_CREATE',
        triggerConfig: {},
        entityType: 'LEAD',
        priority: 0,
        steps: []
    });
    const [saving, setSaving] = useState(false);
    const [selectedStep, setSelectedStep] = useState<number | null>(null);

    useEffect(() => {
        if (workflowId) {
            fetchWorkflow(workflowId);
        }
    }, [workflowId]);

    const fetchWorkflow = async (id: string) => {
        try {
            const res = await fetch(`/api/workflows/${id}`);
            const data = await res.json();
            setWorkflow({
                name: data.name,
                description: data.description || '',
                triggerType: data.triggerType,
                triggerConfig: JSON.parse(data.triggerConfig || '{}'),
                entityType: data.entityType,
                priority: data.priority || 0,
                steps: data.steps.map((s: Record<string, unknown>) => ({
                    ...s,
                    actionConfig: JSON.parse((s.actionConfig as string) || '{}'),
                    conditionConfig: JSON.parse((s.conditionConfig as string) || '{}')
                }))
            });
        } catch (error) {
            console.error('Failed to fetch workflow:', error);
        }
    };

    const addStep = (type: 'CONDITION' | 'ACTION') => {
        const newStep: WorkflowStep = {
            id: `step-${Date.now()}`,
            stepType: type,
            stepOrder: workflow.steps.length,
            actionType: type === 'ACTION' ? 'ASSIGN_USER' : undefined,
            actionConfig: {},
            conditionType: type === 'CONDITION' ? 'IF' : undefined,
            conditionConfig: {}
        };
        setWorkflow({ ...workflow, steps: [...workflow.steps, newStep] });
        setSelectedStep(workflow.steps.length);
    };

    const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
        const newSteps = [...workflow.steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        setWorkflow({ ...workflow, steps: newSteps });
    };

    const removeStep = (index: number) => {
        const newSteps = workflow.steps.filter((_, i) => i !== index);
        setWorkflow({ ...workflow, steps: newSteps });
        setSelectedStep(null);
    };

    const saveWorkflow = async () => {
        if (!workflow.name) {
            alert('Please enter a workflow name');
            return;
        }
        setSaving(true);
        try {
            const url = workflowId ? `/api/workflows/${workflowId}` : '/api/workflows';
            const method = workflowId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(workflow)
            });

            if (res.ok) {
                router.push('/workflows');
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to save workflow');
            }
        } catch (error) {
            console.error('Failed to save workflow:', error);
            alert('Failed to save workflow');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b px-6 py-3 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/workflows')} className="text-gray-500 hover:text-gray-700">
                        ← Back
                    </button>
                    <input
                        type="text"
                        value={workflow.name}
                        onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
                        placeholder="Workflow Name"
                        className="text-xl font-semibold border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-2 py-1"
                    />
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={saveWorkflow}
                        disabled={saving}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Workflow'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Step Palette */}
                <div className="w-64 bg-white border-r p-4 overflow-y-auto">
                    <h3 className="font-medium text-gray-700 mb-3">Trigger</h3>
                    <div className="space-y-2 mb-6">
                        <select
                            value={workflow.entityType}
                            onChange={(e) => setWorkflow({ ...workflow, entityType: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="LEAD">Lead</option>
                            <option value="CASE">Case</option>
                        </select>
                        <select
                            value={workflow.triggerType}
                            onChange={(e) => setWorkflow({ ...workflow, triggerType: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                        >
                            {triggerTypes.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <h3 className="font-medium text-gray-700 mb-3">Add Steps</h3>
                    <div className="space-y-2">
                        <button
                            onClick={() => addStep('CONDITION')}
                            className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-yellow-400 bg-yellow-50 hover:bg-yellow-100 text-sm"
                        >
                            + Add Condition
                        </button>
                        <button
                            onClick={() => addStep('ACTION')}
                            className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-green-400 bg-green-50 hover:bg-green-100 text-sm"
                        >
                            + Add Action
                        </button>
                    </div>

                    <h3 className="font-medium text-gray-700 mt-6 mb-3">Action Types</h3>
                    <div className="space-y-1">
                        {actionTypes.map((action) => (
                            <div key={action.value} className="text-sm text-gray-600 px-2 py-1">
                                {action.icon} {action.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center - Workflow Canvas */}
                <div className="flex-1 p-6 overflow-y-auto">
                    <div className="max-w-2xl mx-auto">
                        {/* Trigger Node */}
                        <div className="bg-blue-500 text-white rounded-lg p-4 mb-4 shadow-lg">
                            <div className="font-medium">🎯 Trigger</div>
                            <div className="text-sm text-blue-100">
                                {workflow.entityType} - {triggerTypes.find(t => t.value === workflow.triggerType)?.label}
                            </div>
                        </div>

                        {/* Steps */}
                        {workflow.steps.map((step, index) => (
                            <div key={step.id} className="mb-4">
                                <div className="w-px h-6 bg-gray-300 mx-auto" />
                                <div
                                    className={`rounded-lg p-4 shadow cursor-pointer transition-all ${step.stepType === 'CONDITION'
                                        ? 'bg-yellow-50 border-2 border-yellow-300'
                                        : 'bg-green-50 border-2 border-green-300'
                                        } ${selectedStep === index ? 'ring-2 ring-blue-500' : ''}`}
                                    onClick={() => setSelectedStep(index)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-medium text-gray-800">
                                                {step.stepType === 'CONDITION' ? '🔀 Condition' : `⚡ ${actionTypes.find(a => a.value === step.actionType)?.label || 'Action'}`}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                Step {index + 1}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {workflow.steps.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                Add steps from the left panel to build your workflow
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Step Configuration */}
                <div className="w-80 bg-white border-l p-4 overflow-y-auto">
                    {selectedStep !== null && workflow.steps[selectedStep] ? (
                        <div>
                            <h3 className="font-medium text-gray-700 mb-4">Configure Step</h3>

                            {workflow.steps[selectedStep].stepType === 'ACTION' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1">Action Type</label>
                                        <select
                                            value={workflow.steps[selectedStep].actionType}
                                            onChange={(e) => updateStep(selectedStep, { actionType: e.target.value })}
                                            className="w-full border rounded-lg px-3 py-2"
                                        >
                                            {actionTypes.map((a) => (
                                                <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Action-specific configuration */}


                                    {workflow.steps[selectedStep].actionType === 'ASSIGN_USER' && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Strategy</label>
                                                <select
                                                    value={(workflow.steps[selectedStep].actionConfig.strategy as string) || 'ROUND_ROBIN'}
                                                    onChange={(e) => updateStep(selectedStep, {
                                                        actionConfig: { ...workflow.steps[selectedStep].actionConfig, strategy: e.target.value }
                                                    })}
                                                    className="w-full border rounded px-3 py-2 text-sm"
                                                >
                                                    <option value="ROUND_ROBIN">Round Robin</option>
                                                    <option value="LEAST_LOADED">Least Loaded</option>
                                                    <option value="TERRITORY_BASED">Territory Based</option>
                                                    <option value="SKILL_BASED">Skill Based</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {workflow.steps[selectedStep].actionType === 'UPDATE_FIELD' && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Field</label>
                                                <input
                                                    type="text"
                                                    placeholder="status"
                                                    value={(workflow.steps[selectedStep].actionConfig.field as string) || ''}
                                                    onChange={(e) => updateStep(selectedStep, {
                                                        actionConfig: { ...workflow.steps[selectedStep].actionConfig, field: e.target.value }
                                                    })}
                                                    className="w-full border rounded px-3 py-2 text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Value</label>
                                                <input
                                                    type="text"
                                                    value={(workflow.steps[selectedStep].actionConfig.value as string) || ''}
                                                    onChange={(e) => updateStep(selectedStep, {
                                                        actionConfig: { ...workflow.steps[selectedStep].actionConfig, value: e.target.value }
                                                    })}
                                                    className="w-full border rounded px-3 py-2 text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {workflow.steps[selectedStep].actionType === 'WAIT' && (
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Duration (minutes)</label>
                                            <input
                                                type="number"
                                                value={(workflow.steps[selectedStep].actionConfig.duration as number) || 60}
                                                onChange={(e) => updateStep(selectedStep, {
                                                    actionConfig: { ...workflow.steps[selectedStep].actionConfig, duration: parseInt(e.target.value) }
                                                })}
                                                className="w-full border rounded px-3 py-2 text-sm"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {workflow.steps[selectedStep].stepType === 'CONDITION' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Field</label>
                                        <input
                                            type="text"
                                            placeholder="status"
                                            value={(workflow.steps[selectedStep].conditionConfig.field as string) || ''}
                                            onChange={(e) => updateStep(selectedStep, {
                                                conditionConfig: { ...workflow.steps[selectedStep].conditionConfig, field: e.target.value }
                                            })}
                                            className="w-full border rounded px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Operator</label>
                                        <select
                                            value={(workflow.steps[selectedStep].conditionConfig.operator as string) || 'EQUALS'}
                                            onChange={(e) => updateStep(selectedStep, {
                                                conditionConfig: { ...workflow.steps[selectedStep].conditionConfig, operator: e.target.value }
                                            })}
                                            className="w-full border rounded px-3 py-2 text-sm"
                                        >
                                            <option value="EQUALS">Equals</option>
                                            <option value="NOT_EQUALS">Not Equals</option>
                                            <option value="CONTAINS">Contains</option>
                                            <option value="GREATER_THAN">Greater Than</option>
                                            <option value="LESS_THAN">Less Than</option>
                                            <option value="IS_EMPTY">Is Empty</option>
                                            <option value="IS_NOT_EMPTY">Is Not Empty</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Value</label>
                                        <input
                                            type="text"
                                            value={(workflow.steps[selectedStep].conditionConfig.value as string) || ''}
                                            onChange={(e) => updateStep(selectedStep, {
                                                conditionConfig: { ...workflow.steps[selectedStep].conditionConfig, value: e.target.value }
                                            })}
                                            className="w-full border rounded px-3 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-center py-8">
                            Select a step to configure
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
