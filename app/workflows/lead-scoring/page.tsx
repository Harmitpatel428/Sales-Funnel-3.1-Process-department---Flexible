'use client';

/**
 * Lead Scoring Configuration Page
 */

import { useState, useEffect } from 'react';

interface ScoringRule {
    field: string;
    operator: string;
    value: string | number;
    points: number;
}

interface ScoringConfig {
    enabled: boolean;
    rules: ScoringRule[];
    autoUpdatePriority: boolean;
    thresholds: { HIGH: number; MEDIUM: number; LOW: number };
}

const operators = [
    { value: 'EQUALS', label: 'Equals' },
    { value: 'NOT_EQUALS', label: 'Not Equals' },
    { value: 'GREATER_THAN', label: 'Greater Than' },
    { value: 'LESS_THAN', label: 'Less Than' },
    { value: 'CONTAINS', label: 'Contains' },
    { value: 'IS_NOT_EMPTY', label: 'Is Not Empty' },
    { value: 'IS_NEWER_THAN', label: 'Is Newer Than' }
];

const leadFields = [
    'status', 'budget', 'company', 'email', 'mobileNumber',
    'source', 'kva', 'lastActivityDate', 'followUpDate'
];

export default function LeadScoringPage() {
    const [config, setConfig] = useState<ScoringConfig>({
        enabled: true,
        rules: [],
        autoUpdatePriority: true,
        thresholds: { HIGH: 70, MEDIUM: 40, LOW: 0 }
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/lead-scoring');
            const data = await res.json();
            setConfig(data);
        } catch (error) {
            console.error('Failed to fetch config:', error);
        }
    };

    const addRule = () => {
        setConfig({
            ...config,
            rules: [...config.rules, { field: 'status', operator: 'EQUALS', value: '', points: 5 }]
        });
    };

    const updateRule = (index: number, updates: Partial<ScoringRule>) => {
        const newRules = [...config.rules];
        newRules[index] = { ...newRules[index], ...updates };
        setConfig({ ...config, rules: newRules });
    };

    const removeRule = (index: number) => {
        setConfig({ ...config, rules: config.rules.filter((_, i) => i !== index) });
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/lead-scoring', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (res.ok) {
                setMessage('Configuration saved successfully');
                setTimeout(() => setMessage(''), 3000);
            }
        } catch (error) {
            console.error('Failed to save:', error);
            setMessage('Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const recalculateAll = async () => {
        try {
            const res = await fetch('/api/lead-scoring', { method: 'POST' });
            const data = await res.json();
            setMessage(`Recalculated scores for ${data.calculated} leads`);
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error('Failed to recalculate:', error);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Lead Scoring</h1>
                    <p className="text-gray-600">Configure automatic lead scoring rules</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={recalculateAll}
                        className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50"
                    >
                        Recalculate All
                    </button>
                    <button
                        onClick={saveConfig}
                        disabled={saving}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>

            {message && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6">
                    {message}
                </div>
            )}

            {/* Settings */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Settings</h2>
                <div className="space-y-4">
                    <label className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                            className="w-4 h-4"
                        />
                        <span>Enable lead scoring</span>
                    </label>
                    <label className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={config.autoUpdatePriority}
                            onChange={(e) => setConfig({ ...config, autoUpdatePriority: e.target.checked })}
                            className="w-4 h-4"
                        />
                        <span>Automatically update lead priority based on score</span>
                    </label>
                </div>
            </div>

            {/* Thresholds */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Priority Thresholds</h2>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">High Priority (≥)</label>
                        <input
                            type="number"
                            value={config.thresholds.HIGH}
                            onChange={(e) => setConfig({
                                ...config,
                                thresholds: { ...config.thresholds, HIGH: parseInt(e.target.value) }
                            })}
                            className="w-full border rounded-lg px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Medium Priority (≥)</label>
                        <input
                            type="number"
                            value={config.thresholds.MEDIUM}
                            onChange={(e) => setConfig({
                                ...config,
                                thresholds: { ...config.thresholds, MEDIUM: parseInt(e.target.value) }
                            })}
                            className="w-full border rounded-lg px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Low Priority (≥)</label>
                        <input
                            type="number"
                            value={config.thresholds.LOW}
                            onChange={(e) => setConfig({
                                ...config,
                                thresholds: { ...config.thresholds, LOW: parseInt(e.target.value) }
                            })}
                            className="w-full border rounded-lg px-3 py-2"
                        />
                    </div>
                </div>
            </div>

            {/* Scoring Rules */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium text-gray-900">Scoring Rules</h2>
                    <button onClick={addRule} className="text-blue-600 hover:underline text-sm">
                        + Add Rule
                    </button>
                </div>

                <div className="space-y-4">
                    {config.rules.map((rule, index) => (
                        <div key={index} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg">
                            <select
                                value={rule.field}
                                onChange={(e) => updateRule(index, { field: e.target.value })}
                                className="border rounded px-3 py-2"
                            >
                                {leadFields.map((f) => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                            <select
                                value={rule.operator}
                                onChange={(e) => updateRule(index, { operator: e.target.value })}
                                className="border rounded px-3 py-2"
                            >
                                {operators.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={rule.value}
                                onChange={(e) => updateRule(index, { value: e.target.value })}
                                placeholder="Value"
                                className="border rounded px-3 py-2 flex-1"
                            />
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">Points:</span>
                                <input
                                    type="number"
                                    value={rule.points}
                                    onChange={(e) => updateRule(index, { points: parseInt(e.target.value) })}
                                    className="border rounded px-3 py-2 w-20"
                                />
                            </div>
                            <button onClick={() => removeRule(index)} className="text-red-500 hover:text-red-700">
                                ×
                            </button>
                        </div>
                    ))}

                    {config.rules.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                            No scoring rules configured. Add rules to start scoring leads.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
