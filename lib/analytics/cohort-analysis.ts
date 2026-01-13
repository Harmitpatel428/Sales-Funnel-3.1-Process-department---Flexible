/**
 * Cohort Analysis Library
 */

export interface CohortData {
    cohortKey: string;
    cohortLabel: string;
    totalCount: number;
    retentionByPeriod: number[];
}

export interface SegmentData {
    segmentKey: string;
    count: number;
    conversionRate: number;
    avgDealSize: number;
}

export interface RFMScore {
    id: string;
    recency: number;
    frequency: number;
    monetary: number;
    segment: string;
}

export function buildCohorts(leads: any[], cohortBy: 'month' | 'quarter' = 'month'): CohortData[] {
    const cohorts: Record<string, any[]> = {};

    leads.forEach(lead => {
        const createdAt = new Date(lead.createdAt);
        let cohortKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;

        if (cohortBy === 'quarter') {
            const quarter = Math.floor(createdAt.getMonth() / 3) + 1;
            cohortKey = `${createdAt.getFullYear()}-Q${quarter}`;
        }

        if (!cohorts[cohortKey]) cohorts[cohortKey] = [];
        cohorts[cohortKey].push(lead);
    });

    return Object.keys(cohorts).sort().map(cohortKey => {
        const cohortLeads = cohorts[cohortKey];
        const retentionByPeriod = [100];
        for (let i = 1; i <= 6; i++) {
            const converted = cohortLeads.filter(l => l.status === 'DEAL_CLOSE').length;
            retentionByPeriod.push((converted / cohortLeads.length) * 100);
        }
        return { cohortKey, cohortLabel: cohortKey, totalCount: cohortLeads.length, retentionByPeriod };
    });
}

export function segmentLeads(leads: any[], segmentBy: string): SegmentData[] {
    const segments: Record<string, any[]> = {};

    leads.forEach(lead => {
        const key = lead[segmentBy] || 'Unknown';
        if (!segments[key]) segments[key] = [];
        segments[key].push(lead);
    });

    return Object.entries(segments).map(([segmentKey, segmentLeads]) => {
        const count = segmentLeads.length;
        const closed = segmentLeads.filter(l => l.status === 'DEAL_CLOSE');
        const conversionRate = count > 0 ? (closed.length / count) * 100 : 0;
        const totalValue = closed.reduce((sum, l) => sum + parseFloat(l.budget?.replace(/[^0-9.]/g, '') || '0'), 0);
        const avgDealSize = closed.length > 0 ? totalValue / closed.length : 0;
        return { segmentKey, count, conversionRate, avgDealSize };
    });
}

export function calculateRFMScores(leads: any[]): RFMScore[] {
    const now = new Date();
    return leads.map(lead => {
        const lastActivity = lead.lastActivityDate ? new Date(lead.lastActivityDate) : new Date(lead.createdAt);
        const recencyDays = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
        const activities = JSON.parse(lead.activities || '[]');
        const frequency = activities.length;
        const monetary = parseFloat(lead.budget?.replace(/[^0-9.]/g, '') || '0');

        const recency = Math.min(5, Math.max(1, 6 - Math.floor(recencyDays / 30)));
        const freqScore = Math.min(5, Math.max(1, Math.ceil(frequency / 2)));
        const monScore = Math.min(5, Math.max(1, Math.ceil(monetary / 200000)));

        const avgScore = (recency + freqScore + monScore) / 3;
        let segment = avgScore >= 4 ? 'Champions' : avgScore >= 3 ? 'Loyal' : avgScore >= 2 ? 'Developing' : 'Hibernating';

        return { id: lead.id, recency, frequency: freqScore, monetary: monScore, segment };
    });
}
