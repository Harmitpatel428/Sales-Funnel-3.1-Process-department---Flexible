/**
 * Lead Scoring System
 * Calculates and manages lead scores based on configurable rules
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Scoring rule interface
export interface ScoringRule {
    field: string;
    operator: string;
    value: unknown;
    points: number;
}

// Scoring configuration
export interface LeadScoringConfig {
    enabled: boolean;
    rules: ScoringRule[];
    autoUpdatePriority: boolean;
    thresholds: {
        HIGH: number;
        MEDIUM: number;
        LOW: number;
    };
}

// Score result
export interface ScoreResult {
    score: number;
    breakdown: Record<string, number>;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Default scoring rules
const DEFAULT_SCORING_RULES: ScoringRule[] = [
    // Budget scoring
    { field: 'budget', operator: 'GREATER_THAN', value: 500000, points: 15 },
    { field: 'budget', operator: 'GREATER_THAN', value: 100000, points: 10 },
    { field: 'budget', operator: 'GREATER_THAN', value: 50000, points: 5 },

    // Status scoring
    { field: 'status', operator: 'EQUALS', value: 'QUALIFIED', points: 15 },
    { field: 'status', operator: 'EQUALS', value: 'PROPOSAL', points: 20 },
    { field: 'status', operator: 'EQUALS', value: 'NEGOTIATION', points: 25 },

    // Activity scoring
    { field: 'lastActivityDate', operator: 'IS_NEWER_THAN', value: '7 days', points: 10 },
    { field: 'lastActivityDate', operator: 'IS_NEWER_THAN', value: '14 days', points: 5 },

    // Follow-up compliance
    { field: 'followUpDate', operator: 'IS_NOT_NULL', value: null, points: 5 },

    // Complete information scoring
    { field: 'email', operator: 'IS_NOT_EMPTY', value: null, points: 5 },
    { field: 'mobileNumber', operator: 'IS_NOT_EMPTY', value: null, points: 5 },
    { field: 'company', operator: 'IS_NOT_EMPTY', value: null, points: 5 }
];

/**
 * LeadScoringEngine - Calculates lead scores
 */
export class LeadScoringEngine {
    /**
     * Calculate score for a lead
     */
    static async calculateScore(leadId: string, tenantId: string): Promise<ScoreResult> {
        // Load lead data
        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: {
                activityLogs: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!lead) {
            throw new Error('Lead not found');
        }

        // Load tenant scoring config
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        const workflowSettings = JSON.parse(tenant?.workflowSettings || '{}');
        const scoringConfig: LeadScoringConfig = workflowSettings.leadScoring || {
            enabled: true,
            rules: DEFAULT_SCORING_RULES,
            autoUpdatePriority: true,
            thresholds: { HIGH: 70, MEDIUM: 40, LOW: 0 }
        };

        // Calculate score
        const breakdown: Record<string, number> = {};
        let totalScore = 0;

        // Apply rules
        for (const rule of scoringConfig.rules) {
            const points = this.evaluateRule(rule, lead);
            if (points > 0) {
                const key = `${rule.field}_${rule.operator}`;
                breakdown[key] = (breakdown[key] || 0) + points;
                totalScore += points;
            }
        }

        // Add demographic score
        const demographicScore = this.calculateDemographicScore(lead);
        breakdown['demographic'] = demographicScore;
        totalScore += demographicScore;

        // Add engagement score
        const engagementScore = this.calculateEngagementScore(lead);
        breakdown['engagement'] = engagementScore;
        totalScore += engagementScore;

        // Cap at 100
        totalScore = Math.min(100, totalScore);

        // Determine priority
        const priority = this.getPriority(totalScore, scoringConfig.thresholds);

        // Save score
        await prisma.leadScore.upsert({
            where: { leadId },
            create: {
                tenantId,
                leadId,
                score: totalScore,
                scoreBreakdown: JSON.stringify(breakdown),
                lastCalculatedAt: new Date()
            },
            update: {
                score: totalScore,
                scoreBreakdown: JSON.stringify(breakdown),
                lastCalculatedAt: new Date()
            }
        });

        // Update lead priority if auto-update is enabled
        if (scoringConfig.autoUpdatePriority) {
            const customFields = JSON.parse(lead.customFields || '{}');
            customFields.priority = priority;
            customFields.score = totalScore;
            await prisma.lead.update({
                where: { id: leadId },
                data: { customFields: JSON.stringify(customFields) }
            });
        }

        return { score: totalScore, breakdown, priority };
    }

    /**
     * Get score breakdown for a lead
     */
    static async getScoreBreakdown(leadId: string): Promise<ScoreResult | null> {
        const leadScore = await prisma.leadScore.findUnique({
            where: { leadId }
        });

        if (!leadScore) {
            return null;
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: leadScore.tenantId }
        });

        const workflowSettings = JSON.parse(tenant?.workflowSettings || '{}');
        const thresholds = workflowSettings.leadScoring?.thresholds || { HIGH: 70, MEDIUM: 40, LOW: 0 };

        return {
            score: leadScore.score,
            breakdown: JSON.parse(leadScore.scoreBreakdown),
            priority: this.getPriority(leadScore.score, thresholds)
        };
    }

    /**
     * Evaluate a single scoring rule
     */
    private static evaluateRule(rule: ScoringRule, lead: Record<string, unknown>): number {
        const fieldValue = lead[rule.field];

        switch (rule.operator) {
            case 'EQUALS':
                return fieldValue === rule.value ? rule.points : 0;

            case 'NOT_EQUALS':
                return fieldValue !== rule.value ? rule.points : 0;

            case 'GREATER_THAN':
                const numValue = parseFloat(String(fieldValue));
                const numTarget = parseFloat(String(rule.value));
                return !isNaN(numValue) && !isNaN(numTarget) && numValue > numTarget ? rule.points : 0;

            case 'LESS_THAN':
                const nv = parseFloat(String(fieldValue));
                const nt = parseFloat(String(rule.value));
                return !isNaN(nv) && !isNaN(nt) && nv < nt ? rule.points : 0;

            case 'IS_NOT_NULL':
                return fieldValue !== null && fieldValue !== undefined ? rule.points : 0;

            case 'IS_NOT_EMPTY':
                return fieldValue !== null && fieldValue !== undefined && String(fieldValue).trim() !== '' ? rule.points : 0;

            case 'IS_NEWER_THAN':
                if (!fieldValue) return 0;
                const date = new Date(fieldValue as string);
                const threshold = this.subtractDuration(new Date(), String(rule.value));
                return date > threshold ? rule.points : 0;

            case 'CONTAINS':
                return String(fieldValue || '').toLowerCase().includes(String(rule.value).toLowerCase()) ? rule.points : 0;

            default:
                return 0;
        }
    }

    /**
     * Calculate demographic score based on company/contact info
     */
    private static calculateDemographicScore(lead: Record<string, unknown>): number {
        let score = 0;

        // Company info
        if (lead.company) score += 3;
        if (lead.companyLocation) score += 2;

        // Contact info completeness
        if (lead.email && lead.mobileNumber) score += 3;
        if (lead.gstNumber) score += 2;

        // Business details
        if (lead.kva) score += 3;
        if (lead.discom) score += 2;

        return Math.min(15, score);
    }

    /**
     * Calculate engagement score based on activities
     */
    private static calculateEngagementScore(lead: Record<string, unknown>): number {
        let score = 0;

        // Recent activity
        if (lead.lastActivityDate) {
            const lastActivity = new Date(lead.lastActivityDate as string);
            const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceActivity <= 3) score += 10;
            else if (daysSinceActivity <= 7) score += 7;
            else if (daysSinceActivity <= 14) score += 4;
            else if (daysSinceActivity <= 30) score += 2;
        }

        // Activity logs count
        const activityLogs = (lead.activityLogs as unknown[]) || [];
        score += Math.min(5, activityLogs.length);

        return Math.min(15, score);
    }

    /**
     * Get priority based on score and thresholds
     */
    private static getPriority(
        score: number,
        thresholds: { HIGH: number; MEDIUM: number; LOW: number }
    ): 'HIGH' | 'MEDIUM' | 'LOW' {
        if (score >= thresholds.HIGH) return 'HIGH';
        if (score >= thresholds.MEDIUM) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Subtract duration from date
     */
    private static subtractDuration(date: Date, duration: string): Date {
        const result = new Date(date);
        const match = duration.match(/^(\d+)\s*(day|days|hour|hours|week|weeks|month|months)$/i);

        if (!match) return result;

        const amount = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'day':
            case 'days':
                result.setDate(result.getDate() - amount);
                break;
            case 'hour':
            case 'hours':
                result.setHours(result.getHours() - amount);
                break;
            case 'week':
            case 'weeks':
                result.setDate(result.getDate() - amount * 7);
                break;
            case 'month':
            case 'months':
                result.setMonth(result.getMonth() - amount);
                break;
        }

        return result;
    }

    /**
     * Bulk calculate scores for all leads in a tenant
     */
    static async bulkCalculateScores(tenantId: string): Promise<number> {
        const leads = await prisma.lead.findMany({
            where: {
                tenantId,
                isDeleted: false,
                isDone: false
            },
            select: { id: true }
        });

        let calculated = 0;
        for (const lead of leads) {
            try {
                await this.calculateScore(lead.id, tenantId);
                calculated++;
            } catch (error) {
                console.error(`Failed to calculate score for lead ${lead.id}:`, error);
            }
        }

        return calculated;
    }
}

export default LeadScoringEngine;
