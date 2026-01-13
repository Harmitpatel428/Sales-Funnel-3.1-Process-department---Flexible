"use client";

import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    TrendingUp, TrendingDown, Minus, Calendar, RefreshCw,
    Target, BarChart2, Activity
} from 'lucide-react';

interface ForecastData {
    entity: string;
    period: { start: string; end: string; days: number };
    historical: {
        daily: { date: string; value: number }[];
        conversions: { date: string; value: number }[];
        movingAverages: {
            ma7: { date: string; value: number }[];
            ma30: { date: string; value: number }[];
            ma90: { date: string; value: number }[];
        };
    };
    analysis: {
        regression: { slope: number; intercept: number; rSquared: string };
        trend: { direction: string; strength: string; percentChange: string };
    };
    forecast: {
        predicted: { date: string; predicted: number; lowerBound: number; upperBound: number }[];
        scenarios: {
            bestCase: any[];
            expectedCase: any[];
            worstCase: any[];
        };
    };
    summary: {
        totalCount: number;
        totalConversions: number;
        conversionRate: string;
        avgDailyCount: string;
        avgDailyConversions: string;
        projectedNextMonth: number;
        projectedConversions: number;
    };
}

const FORECAST_PERIODS = [
    { label: '30 Days', value: 30 },
    { label: '60 Days', value: 60 },
    { label: '90 Days', value: 90 },
    { label: '180 Days', value: 180 },
    { label: '1 Year', value: 365 }
];

export default function ForecastingPage() {
    const [entity, setEntity] = useState<'leads' | 'cases'>('leads');
    const [forecastDays, setForecastDays] = useState(30);
    const [data, setData] = useState<ForecastData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showScenarios, setShowScenarios] = useState(false);

    const fetchForecast = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(
                `/api/reports/forecast?entity=${entity}&forecastDays=${forecastDays}`
            );
            const result = await response.json();

            if (result.success) {
                setData(result.data);
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError('Failed to fetch forecast data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchForecast();
    }, [entity, forecastDays]);

    // Combine historical and forecast data for chart
    const chartData = data ? [
        ...data.historical.daily.slice(-90).map(d => ({
            date: d.date,
            actual: d.value,
            ma7: data.historical.movingAverages.ma7.find(m => m.date === d.date)?.value,
            ma30: data.historical.movingAverages.ma30.find(m => m.date === d.date)?.value
        })),
        ...data.forecast.predicted.map(f => ({
            date: f.date,
            predicted: f.predicted,
            lowerBound: f.lowerBound,
            upperBound: f.upperBound
        }))
    ] : [];

    // Scenario data for chart
    const scenarioData = data ? data.forecast.predicted.map((f, i) => ({
        date: f.date,
        expected: f.predicted,
        bestCase: data.forecast.scenarios.bestCase[i]?.predicted || f.upperBound,
        worstCase: data.forecast.scenarios.worstCase[i]?.predicted || f.lowerBound
    })) : [];

    const TrendIcon = data?.analysis.trend.direction === 'up' ? TrendingUp :
        data?.analysis.trend.direction === 'down' ? TrendingDown : Minus;

    const trendColor = data?.analysis.trend.direction === 'up' ? 'text-emerald-600' :
        data?.analysis.trend.direction === 'down' ? 'text-red-600' : 'text-slate-500';

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Sales Forecasting</h1>
                <p className="text-slate-500 mt-1">Time-series analysis and trend predictions</p>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-slate-400" />
                        <select
                            value={entity}
                            onChange={(e) => setEntity(e.target.value as 'leads' | 'cases')}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="leads">Leads</option>
                            <option value="cases">Cases</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <select
                            value={forecastDays}
                            onChange={(e) => setForecastDays(parseInt(e.target.value))}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            {FORECAST_PERIODS.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showScenarios}
                            onChange={(e) => setShowScenarios(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-600">Show Scenarios</span>
                    </label>

                    <button
                        onClick={fetchForecast}
                        className="ml-auto flex items-center gap-2 px-4 py-2 text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6">
                    {error}
                </div>
            )}

            {data && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500">Total {entity}</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{data.summary.totalCount}</p>
                                    <p className="text-sm text-slate-500 mt-1">in {data.period.days} days</p>
                                </div>
                                <div className="p-3 bg-indigo-50 rounded-lg">
                                    <Activity className="w-6 h-6 text-indigo-600" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500">Trend</p>
                                    <div className={`flex items-center gap-2 mt-1 ${trendColor}`}>
                                        <TrendIcon className="w-6 h-6" />
                                        <span className="text-2xl font-bold">{data.analysis.trend.percentChange}%</span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1">R² = {data.analysis.regression.rSquared}</p>
                                </div>
                                <div className={`p-3 rounded-lg ${data.analysis.trend.direction === 'up' ? 'bg-emerald-50' :
                                        data.analysis.trend.direction === 'down' ? 'bg-red-50' : 'bg-slate-50'
                                    }`}>
                                    <TrendIcon className={`w-6 h-6 ${trendColor}`} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500">Projected Next Month</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{data.summary.projectedNextMonth}</p>
                                    <p className="text-sm text-slate-500 mt-1">{entity}</p>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-lg">
                                    <Target className="w-6 h-6 text-blue-600" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500">Projected Conversions</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{data.summary.projectedConversions}</p>
                                    <p className="text-sm text-slate-500 mt-1">({data.summary.conversionRate} rate)</p>
                                </div>
                                <div className="p-3 bg-emerald-50 rounded-lg">
                                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Forecast Chart */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">
                            Historical Data & Forecast
                        </h3>
                        <ResponsiveContainer width="100%" height={400}>
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                                />
                                <YAxis />
                                <Tooltip
                                    labelFormatter={(date) => new Date(date).toLocaleDateString('en-IN')}
                                    formatter={(value: number) => [value.toFixed(1), '']}
                                />
                                <Legend />

                                {/* Confidence interval */}
                                <Area
                                    type="monotone"
                                    dataKey="upperBound"
                                    stroke="none"
                                    fill="url(#confidenceGradient)"
                                    name="Upper Bound"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="lowerBound"
                                    stroke="none"
                                    fill="#fff"
                                    name="Lower Bound"
                                />

                                {/* Historical data */}
                                <Line
                                    type="monotone"
                                    dataKey="actual"
                                    stroke="#64748b"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Actual"
                                />

                                {/* Moving averages */}
                                <Line
                                    type="monotone"
                                    dataKey="ma7"
                                    stroke="#06b6d4"
                                    strokeWidth={1}
                                    strokeDasharray="3 3"
                                    dot={false}
                                    name="7-day MA"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="ma30"
                                    stroke="#10b981"
                                    strokeWidth={1}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    name="30-day MA"
                                />

                                {/* Forecast */}
                                <Line
                                    type="monotone"
                                    dataKey="predicted"
                                    stroke="#4f46e5"
                                    strokeWidth={2}
                                    strokeDasharray="5 2"
                                    dot={false}
                                    name="Forecast"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Scenario Analysis */}
                    {showScenarios && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">
                                Scenario Analysis
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={scenarioData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(date) => new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                                    />
                                    <YAxis />
                                    <Tooltip
                                        labelFormatter={(date) => new Date(date).toLocaleDateString('en-IN')}
                                    />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="bestCase"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        name="Best Case"
                                        dot={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="expected"
                                        stroke="#4f46e5"
                                        strokeWidth={2}
                                        name="Expected"
                                        dot={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="worstCase"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        name="Worst Case"
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>

                            <div className="grid grid-cols-3 gap-4 mt-6">
                                <div className="p-4 bg-emerald-50 rounded-lg">
                                    <h4 className="text-sm font-medium text-emerald-800">Best Case</h4>
                                    <p className="text-2xl font-bold text-emerald-700 mt-1">
                                        {Math.round(scenarioData.reduce((sum, d) => sum + d.bestCase, 0))}
                                    </p>
                                    <p className="text-xs text-emerald-600 mt-1">{entity} projected</p>
                                </div>
                                <div className="p-4 bg-indigo-50 rounded-lg">
                                    <h4 className="text-sm font-medium text-indigo-800">Expected</h4>
                                    <p className="text-2xl font-bold text-indigo-700 mt-1">
                                        {Math.round(scenarioData.reduce((sum, d) => sum + d.expected, 0))}
                                    </p>
                                    <p className="text-xs text-indigo-600 mt-1">{entity} projected</p>
                                </div>
                                <div className="p-4 bg-red-50 rounded-lg">
                                    <h4 className="text-sm font-medium text-red-800">Worst Case</h4>
                                    <p className="text-2xl font-bold text-red-700 mt-1">
                                        {Math.round(scenarioData.reduce((sum, d) => sum + d.worstCase, 0))}
                                    </p>
                                    <p className="text-xs text-red-600 mt-1">{entity} projected</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Analysis Details */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">Regression Analysis</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Slope (daily change)</span>
                                    <span className="font-medium">{data.analysis.regression.slope.toFixed(4)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Intercept</span>
                                    <span className="font-medium">{data.analysis.regression.intercept.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">R-squared</span>
                                    <span className="font-medium">{data.analysis.regression.rSquared}</span>
                                </div>
                                <div className="pt-4 border-t border-slate-200">
                                    <p className="text-sm text-slate-500">
                                        R² of {data.analysis.regression.rSquared} indicates
                                        {parseFloat(data.analysis.regression.rSquared) > 0.7 ? ' strong' :
                                            parseFloat(data.analysis.regression.rSquared) > 0.4 ? ' moderate' : ' weak'}
                                        {' '}linear relationship in the data.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Averages</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Avg daily {entity}</span>
                                    <span className="font-medium">{data.summary.avgDailyCount}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Avg daily conversions</span>
                                    <span className="font-medium">{data.summary.avgDailyConversions}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Conversion rate</span>
                                    <span className="font-medium">{data.summary.conversionRate}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Data period</span>
                                    <span className="font-medium">{data.period.days} days</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
