"use client";

import React, { useState, useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    GripVertical, Plus, X, Filter, BarChart3,
    Table, PieChart, TrendingUp, Save, Play,
    ChevronDown, ChevronRight, Settings
} from 'lucide-react';
import {
    DATA_SOURCE_FIELDS,
    type ReportField,
    type ReportFilter,
    type ReportConfig,
    type ChartType
} from '@/lib/validation/report-schemas';

// Sortable field item component
function SortableFieldItem({
    field,
    onRemove,
    onToggleAggregation
}: {
    field: ReportField & { id: string };
    onRemove: () => void;
    onToggleAggregation: (agg: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: field.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg shadow-sm group"
        >
            <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
            >
                <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1">
                <span className="font-medium text-slate-800">{field.label}</span>
                <span className="text-xs text-slate-500 ml-2">({field.type})</span>
            </div>
            {field.type === 'number' && (
                <select
                    value={field.aggregation || ''}
                    onChange={(e) => onToggleAggregation(e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1"
                >
                    <option value="">No aggregation</option>
                    <option value="sum">Sum</option>
                    <option value="average">Average</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                    <option value="count">Count</option>
                </select>
            )}
            <button
                onClick={onRemove}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// Chart type button component
function ChartTypeButton({
    type,
    icon: Icon,
    label,
    active,
    onClick
}: {
    type: ChartType;
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
        >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}

export default function ReportBuilderPage() {
    const [dataSource, setDataSource] = useState<'leads' | 'cases' | 'users'>('leads');
    const [selectedFields, setSelectedFields] = useState<(ReportField & { id: string })[]>([]);
    const [filters, setFilters] = useState<ReportFilter[]>([]);
    const [chartType, setChartType] = useState<ChartType>('TABLE');
    const [groupBy, setGroupBy] = useState<string>('');
    const [reportName, setReportName] = useState('');
    const [reportDescription, setReportDescription] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const availableFields = useMemo(() => {
        const fields = DATA_SOURCE_FIELDS[dataSource] || [];
        const selectedKeys = new Set(selectedFields.map(f => f.fieldKey));
        return fields.filter(f => !selectedKeys.has(f.fieldKey));
    }, [dataSource, selectedFields]);

    // Group fields by category
    const fieldCategories = useMemo(() => {
        const categories: Record<string, ReportField[]> = {
            'Basic Info': [],
            'Contact Details': [],
            'Financial': [],
            'Dates': [],
            'Status': [],
            'Other': []
        };

        availableFields.forEach(field => {
            if (['clientName', 'company', 'name'].includes(field.fieldKey)) {
                categories['Basic Info'].push(field);
            } else if (['email', 'mobileNumber'].includes(field.fieldKey)) {
                categories['Contact Details'].push(field);
            } else if (['budget', 'termLoanAmount', 'plantMachineryValue'].includes(field.fieldKey) || field.format === 'currency') {
                categories['Financial'].push(field);
            } else if (field.type === 'date') {
                categories['Dates'].push(field);
            } else if (['status', 'processStatus', 'priority', 'role'].includes(field.fieldKey) || field.type === 'enum') {
                categories['Status'].push(field);
            } else {
                categories['Other'].push(field);
            }
        });

        return Object.entries(categories).filter(([_, fields]) => fields.length > 0);
    }, [availableFields]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setSelectedFields((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const addField = (field: ReportField) => {
        setSelectedFields(prev => [...prev, { ...field, id: `${field.fieldKey}-${Date.now()}` }]);
    };

    const removeField = (id: string) => {
        setSelectedFields(prev => prev.filter(f => f.id !== id));
    };

    const updateFieldAggregation = (id: string, aggregation: string) => {
        setSelectedFields(prev => prev.map(f =>
            f.id === id ? { ...f, aggregation: aggregation as any } : f
        ));
    };

    const addFilter = () => {
        if (selectedFields.length === 0) return;
        setFilters(prev => [...prev, {
            fieldKey: selectedFields[0].fieldKey,
            operator: 'equals',
            value: ''
        }]);
    };

    const updateFilter = (index: number, updates: Partial<ReportFilter>) => {
        setFilters(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
    };

    const removeFilter = (index: number) => {
        setFilters(prev => prev.filter((_, i) => i !== index));
    };

    const buildReportConfig = (): ReportConfig => ({
        dataSource,
        fields: selectedFields.map(({ id, ...rest }) => rest),
        filters,
        sorts: [],
        groupBy: groupBy ? { fieldKey: groupBy } : undefined,
        chartType,
        limit: 1000,
        includeSubtotals: false,
        includeTotals: false
    });

    const handleSaveReport = async () => {
        if (!reportName.trim()) {
            alert('Please enter a report name');
            return;
        }
        if (selectedFields.length === 0) {
            alert('Please select at least one field');
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch('/api/reports/builder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: reportName,
                    description: reportDescription,
                    config: buildReportConfig(),
                    chartType,
                    isPublic: false
                })
            });

            const data = await response.json();
            if (data.success) {
                alert('Report saved successfully!');
            } else {
                alert(`Failed to save report: ${data.message}`);
            }
        } catch (error) {
            alert('Error saving report');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRunReport = () => {
        setShowPreview(true);
        // In a real implementation, this would fetch and display the report data
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Custom Report Builder</h1>
                        <p className="text-slate-500 text-sm mt-1">Drag and drop fields to build your custom report</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRunReport}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            <Play className="w-4 h-4" />
                            Preview
                        </button>
                        <button
                            onClick={handleSaveReport}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save Report'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex h-[calc(100vh-80px)]">
                {/* Left Panel - Field Selector */}
                <div className="w-72 bg-white border-r border-slate-200 overflow-y-auto">
                    <div className="p-4 border-b border-slate-200">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Data Source</label>
                        <select
                            value={dataSource}
                            onChange={(e) => {
                                setDataSource(e.target.value as any);
                                setSelectedFields([]);
                                setFilters([]);
                                setGroupBy('');
                            }}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="leads">Leads</option>
                            <option value="cases">Cases</option>
                            <option value="users">Users</option>
                        </select>
                    </div>

                    <div className="p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Available Fields</h3>
                        <div className="space-y-4">
                            {fieldCategories.map(([category, fields]) => (
                                <div key={category}>
                                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{category}</h4>
                                    <div className="space-y-1">
                                        {fields.map(field => (
                                            <button
                                                key={field.fieldKey}
                                                onClick={() => addField(field)}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors"
                                            >
                                                <Plus className="w-4 h-4 text-slate-400" />
                                                {field.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Center Panel - Canvas */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Report Name */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Report Name</label>
                                <input
                                    type="text"
                                    value={reportName}
                                    onChange={(e) => setReportName(e.target.value)}
                                    placeholder="Enter report name..."
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
                                <input
                                    type="text"
                                    value={reportDescription}
                                    onChange={(e) => setReportDescription(e.target.value)}
                                    placeholder="Brief description..."
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Selected Fields */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900">Report Columns</h3>
                            <span className="text-sm text-slate-500">{selectedFields.length} fields selected</span>
                        </div>

                        {selectedFields.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                <p>Drag fields from the left panel or click to add</p>
                            </div>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={selectedFields.map(f => f.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-2">
                                        {selectedFields.map((field) => (
                                            <SortableFieldItem
                                                key={field.id}
                                                field={field}
                                                onRemove={() => removeField(field.id)}
                                                onToggleAggregation={(agg) => updateFieldAggregation(field.id, agg)}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 w-full text-left"
                        >
                            {showFilters ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <Filter className="w-4 h-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">Filters</span>
                            {filters.length > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                                    {filters.length}
                                </span>
                            )}
                        </button>

                        {showFilters && (
                            <div className="mt-4 space-y-3">
                                {filters.map((filter, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <select
                                            value={filter.fieldKey}
                                            onChange={(e) => updateFilter(index, { fieldKey: e.target.value })}
                                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        >
                                            {selectedFields.map(f => (
                                                <option key={f.id} value={f.fieldKey}>{f.label}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={filter.operator}
                                            onChange={(e) => updateFilter(index, { operator: e.target.value as any })}
                                            className="w-36 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        >
                                            <option value="equals">Equals</option>
                                            <option value="notEquals">Not Equals</option>
                                            <option value="contains">Contains</option>
                                            <option value="greaterThan">Greater Than</option>
                                            <option value="lessThan">Less Than</option>
                                        </select>
                                        <input
                                            type="text"
                                            value={String(filter.value || '')}
                                            onChange={(e) => updateFilter(index, { value: e.target.value })}
                                            placeholder="Value"
                                            className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <button
                                            onClick={() => removeFilter(index)}
                                            className="text-slate-400 hover:text-red-500"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addFilter}
                                    disabled={selectedFields.length === 0}
                                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Filter
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Group By */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Settings className="w-4 h-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">Group By</span>
                        </div>
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="">No grouping</option>
                            {selectedFields.map(f => (
                                <option key={f.id} value={f.fieldKey}>{f.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Chart Type */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-900 mb-4">Visualization Type</h3>
                        <div className="grid grid-cols-4 gap-3">
                            <ChartTypeButton
                                type="TABLE"
                                icon={Table}
                                label="Table"
                                active={chartType === 'TABLE'}
                                onClick={() => setChartType('TABLE')}
                            />
                            <ChartTypeButton
                                type="BAR"
                                icon={BarChart3}
                                label="Bar Chart"
                                active={chartType === 'BAR'}
                                onClick={() => setChartType('BAR')}
                            />
                            <ChartTypeButton
                                type="LINE"
                                icon={TrendingUp}
                                label="Line Chart"
                                active={chartType === 'LINE'}
                                onClick={() => setChartType('LINE')}
                            />
                            <ChartTypeButton
                                type="PIE"
                                icon={PieChart}
                                label="Pie Chart"
                                active={chartType === 'PIE'}
                                onClick={() => setChartType('PIE')}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Panel - Preview */}
                {showPreview && (
                    <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-900">Preview</h3>
                            <button
                                onClick={() => setShowPreview(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="text-center py-12 text-slate-500">
                            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                            <p className="text-sm">Preview will appear here after running the report</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
