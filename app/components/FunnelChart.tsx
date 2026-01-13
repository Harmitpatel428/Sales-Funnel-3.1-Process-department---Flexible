"use client";

import React from 'react';
import {
    FunnelChart as RechartsFunnelChart,
    Funnel,
    LabelList,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';

interface FunnelDataPoint {
    name: string;
    value: number;
    fill?: string;
}

interface FunnelChartProps {
    data: FunnelDataPoint[];
    colors?: string[];
    onStageClick?: (stage: FunnelDataPoint) => void;
    width?: string | number;
    height?: string | number;
}

const DEFAULT_COLORS = [
    '#4f46e5', // indigo-600
    '#6366f1', // indigo-500
    '#818cf8', // indigo-400
    '#a5b4fc', // indigo-300
    '#c7d2fe', // indigo-200
    '#e0e7ff', // indigo-100
];

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg">
                <p className="font-semibold text-slate-800">{data.name}</p>
                <p className="text-indigo-600 font-bold">{data.value} items</p>
            </div>
        );
    }

    return null;
};

export const FunnelChart: React.FC<FunnelChartProps> = ({
    data,
    colors = DEFAULT_COLORS,
    onStageClick,
    width = '100%',
    height = 400
}) => {
    // Filter out zero values to avoid rendering issues if necessary, usually Recharts handles it
    const chartData = data.map((item, index) => ({
        ...item,
        fill: item.fill || colors[index % colors.length]
    }));

    return (
        <div style={{ width, height }} className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsFunnelChart>
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                    <Funnel
                        dataKey="value"
                        data={chartData}
                        isAnimationActive
                        onClick={(data) => onStageClick && onStageClick(data as FunnelDataPoint)}
                        cursor="pointer"
                    >
                        <LabelList
                            position="right"
                            fill="#000"
                            stroke="none"
                            dataKey="name"
                            content={(props: any) => {
                                const { x, y, width, height, value, name } = props;
                                return (
                                    <text
                                        x={x + width + 10}
                                        y={y + height / 2 + 5}
                                        fill="#334155"
                                        textAnchor="start"
                                        className="text-sm font-medium"
                                    >
                                        {name}: {value}
                                    </text>
                                );
                            }}
                        />
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                        ))}
                    </Funnel>
                </RechartsFunnelChart>
            </ResponsiveContainer>
        </div>
    );
};

export default FunnelChart;
