/**
 * Forecasting Analytics Library
 * Provides time-series analysis and forecasting functions
 */

export interface DataPoint {
    date: string;
    value: number;
}

export interface ForecastResult {
    date: string;
    predicted: number;
    lowerBound: number;
    upperBound: number;
}

export interface RegressionResult {
    slope: number;
    intercept: number;
    rSquared: number;
}

export interface SeasonalPattern {
    period: number;
    strength: number;
    indices: number[];
}

/**
 * Calculate simple moving average
 */
export function calculateMovingAverage(data: DataPoint[], period: number): DataPoint[] {
    if (data.length < period) {
        return [];
    }

    const result: DataPoint[] = [];

    for (let i = period - 1; i < data.length; i++) {
        const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.value, 0);
        result.push({
            date: data[i].date,
            value: sum / period
        });
    }

    return result;
}

/**
 * Calculate exponential moving average
 */
export function calculateExponentialMovingAverage(data: DataPoint[], period: number): DataPoint[] {
    if (data.length === 0) {
        return [];
    }

    const multiplier = 2 / (period + 1);
    const result: DataPoint[] = [];

    // First EMA is just the first value
    let ema = data[0].value;
    result.push({ date: data[0].date, value: ema });

    for (let i = 1; i < data.length; i++) {
        ema = (data[i].value - ema) * multiplier + ema;
        result.push({ date: data[i].date, value: ema });
    }

    return result;
}

/**
 * Calculate linear regression
 */
export function calculateLinearRegression(data: DataPoint[]): RegressionResult {
    const n = data.length;

    if (n < 2) {
        return { slope: 0, intercept: 0, rSquared: 0 };
    }

    // Use index as x values
    const xValues = data.map((_, i) => i);
    const yValues = data.map(d => d.value);

    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
    const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);

    const meanX = sumX / n;
    const meanY = sumY / n;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = meanY - slope * meanX;

    // Calculate R-squared
    const yPredicted = xValues.map(x => slope * x + intercept);
    const ssRes = yValues.reduce((acc, y, i) => acc + Math.pow(y - yPredicted[i], 2), 0);
    const ssTot = yValues.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
    const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { slope, intercept, rSquared };
}

/**
 * Forecast future values using linear regression
 */
export function forecastTimeSeries(
    historicalData: DataPoint[],
    periodsAhead: number,
    confidenceLevel: number = 0.95
): ForecastResult[] {
    const regression = calculateLinearRegression(historicalData);
    const n = historicalData.length;

    // Calculate standard error
    const yValues = historicalData.map(d => d.value);
    const predictions = historicalData.map((_, i) => regression.slope * i + regression.intercept);
    const residuals = yValues.map((y, i) => y - predictions[i]);
    const standardError = Math.sqrt(
        residuals.reduce((acc, r) => acc + r * r, 0) / (n - 2)
    );

    // Z-score for confidence level (simplified)
    const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;

    const results: ForecastResult[] = [];
    const lastDate = new Date(historicalData[n - 1].date);

    for (let i = 1; i <= periodsAhead; i++) {
        const x = n - 1 + i;
        const predicted = regression.slope * x + regression.intercept;

        // Prediction interval widens as we forecast further ahead
        const margin = zScore * standardError * Math.sqrt(1 + 1 / n + Math.pow(x - n / 2, 2));

        // Calculate next date
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + i);

        results.push({
            date: nextDate.toISOString().split('T')[0],
            predicted: Math.max(0, predicted),
            lowerBound: Math.max(0, predicted - margin),
            upperBound: predicted + margin
        });
    }

    return results;
}

/**
 * Detect seasonality in time series data
 */
export function detectSeasonality(data: DataPoint[], maxPeriod: number = 12): SeasonalPattern | null {
    if (data.length < maxPeriod * 2) {
        return null;
    }

    let bestPeriod = 0;
    let bestCorrelation = 0;

    // Test different period lengths
    for (let period = 2; period <= maxPeriod; period++) {
        const correlation = calculateAutoCorrelation(data, period);
        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestPeriod = period;
        }
    }

    if (bestCorrelation < 0.3) {
        return null; // No significant seasonality detected
    }

    // Calculate seasonal indices
    const indices: number[] = [];
    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    for (let i = 0; i < bestPeriod; i++) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < values.length; j += bestPeriod) {
            sum += values[j];
            count++;
        }
        indices.push(count > 0 ? (sum / count) / mean : 1);
    }

    return {
        period: bestPeriod,
        strength: bestCorrelation,
        indices
    };
}

/**
 * Calculate autocorrelation at a given lag
 */
function calculateAutoCorrelation(data: DataPoint[], lag: number): number {
    const values = data.map(d => d.value);
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n - lag; i++) {
        numerator += (values[i] - mean) * (values[i + lag] - mean);
    }

    for (let i = 0; i < n; i++) {
        denominator += Math.pow(values[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate confidence interval for a forecast
 */
export function calculateConfidenceInterval(
    forecast: number[],
    historicalData: DataPoint[],
    confidenceLevel: number = 0.95
): { lower: number[]; upper: number[] } {
    const values = historicalData.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;

    const lower = forecast.map((f, i) => Math.max(0, f - zScore * stdDev * Math.sqrt(1 + (i + 1) / historicalData.length)));
    const upper = forecast.map((f, i) => f + zScore * stdDev * Math.sqrt(1 + (i + 1) / historicalData.length));

    return { lower, upper };
}

/**
 * Calculate trend direction and magnitude
 */
export function calculateTrend(data: DataPoint[]): {
    direction: 'up' | 'down' | 'flat';
    strength: number;
    percentChange: number;
} {
    if (data.length < 2) {
        return { direction: 'flat', strength: 0, percentChange: 0 };
    }

    const regression = calculateLinearRegression(data);
    const firstValue = data[0].value;
    const lastValue = data[data.length - 1].value;
    const percentChange = firstValue === 0 ? 0 : ((lastValue - firstValue) / firstValue) * 100;

    let direction: 'up' | 'down' | 'flat';
    if (regression.slope > 0.01) {
        direction = 'up';
    } else if (regression.slope < -0.01) {
        direction = 'down';
    } else {
        direction = 'flat';
    }

    return {
        direction,
        strength: Math.abs(regression.rSquared),
        percentChange
    };
}

/**
 * Generate scenario forecasts (best, expected, worst case)
 */
export function generateScenarioForecasts(
    historicalData: DataPoint[],
    periodsAhead: number
): {
    bestCase: ForecastResult[];
    expectedCase: ForecastResult[];
    worstCase: ForecastResult[];
} {
    const expectedCase = forecastTimeSeries(historicalData, periodsAhead, 0.5);

    // Best case: Use upper confidence bound
    const bestCase = forecastTimeSeries(historicalData, periodsAhead, 0.9).map(f => ({
        ...f,
        predicted: f.upperBound,
        lowerBound: f.predicted,
        upperBound: f.upperBound * 1.2
    }));

    // Worst case: Use lower confidence bound
    const worstCase = forecastTimeSeries(historicalData, periodsAhead, 0.9).map(f => ({
        ...f,
        predicted: Math.max(0, f.lowerBound),
        lowerBound: Math.max(0, f.lowerBound * 0.8),
        upperBound: f.predicted
    }));

    return { bestCase, expectedCase, worstCase };
}
