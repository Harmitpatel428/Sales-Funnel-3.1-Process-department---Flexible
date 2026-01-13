/**
 * Automatic Lead Assignment Rules
 * Intelligent lead assignment based on various strategies
 */

import { PrismaClient, User } from '@prisma/client';

const prisma = new PrismaClient();

// Assignment strategies
export type AssignmentStrategy =
    | 'ROUND_ROBIN'
    | 'LEAST_LOADED'
    | 'TERRITORY_BASED'
    | 'SKILL_BASED'
    | 'WEIGHTED';

// Assignment filters
export interface AssignmentFilters {
    role?: string[];
    territory?: string;
    maxActiveLeads?: number;
    skills?: string[];
}

// Assignment result
export interface AssignmentResult {
    userId: string | null;
    strategy: AssignmentStrategy;
    reason: string;
}

// Round robin state (in-memory, should use Redis in production)
const roundRobinState: Map<string, number> = new Map();

/**
 * AssignmentRuleEngine - Handles intelligent lead assignment
 */
export class AssignmentRuleEngine {
    /**
     * Assign a lead based on configured rules
     */
    static async assignLead(
        leadId: string,
        tenantId: string,
        strategy: AssignmentStrategy,
        filters?: AssignmentFilters
    ): Promise<AssignmentResult> {
        // Get lead data
        const lead = await prisma.lead.findUnique({
            where: { id: leadId }
        });

        if (!lead) {
            return { userId: null, strategy, reason: 'Lead not found' };
        }

        // Find best user
        const userId = await this.findBestUser(
            tenantId,
            strategy,
            filters,
            lead as unknown as Record<string, unknown>
        );

        if (!userId) {
            return { userId: null, strategy, reason: 'No eligible user found' };
        }

        // Update lead assignment
        await prisma.lead.update({
            where: { id: leadId },
            data: {
                assignedToId: userId,
                assignedAt: new Date()
            }
        });

        return { userId, strategy, reason: 'Successfully assigned' };
    }

    /**
     * Find the best user for assignment based on strategy
     */
    static async findBestUser(
        tenantId: string,
        strategy: AssignmentStrategy,
        filters?: AssignmentFilters,
        leadData?: Record<string, unknown>
    ): Promise<string | null> {
        // Get eligible users
        const eligibleUsers = await this.getEligibleUsers(tenantId, filters);

        if (eligibleUsers.length === 0) {
            return null;
        }

        switch (strategy) {
            case 'ROUND_ROBIN':
                return this.roundRobinAssignment(tenantId, eligibleUsers);

            case 'LEAST_LOADED':
                return this.leastLoadedAssignment(eligibleUsers);

            case 'TERRITORY_BASED':
                return this.territoryBasedAssignment(eligibleUsers, leadData, filters?.territory);

            case 'SKILL_BASED':
                return this.skillBasedAssignment(eligibleUsers, leadData, filters?.skills);

            case 'WEIGHTED':
                return this.weightedAssignment(eligibleUsers, leadData, filters);

            default:
                return eligibleUsers[0]?.id || null;
        }
    }

    /**
     * Get eligible users based on filters
     */
    private static async getEligibleUsers(
        tenantId: string,
        filters?: AssignmentFilters
    ): Promise<(User & { leadCount: number })[]> {
        // Base query for active users in tenant
        const users = await prisma.user.findMany({
            where: {
                tenantId,
                isActive: true,
                ...(filters?.role && filters.role.length > 0 ? {
                    role: { in: filters.role }
                } : {})
            }
        });

        // Get lead counts for each user
        const usersWithCounts = await Promise.all(
            users.map(async (user) => {
                const leadCount = await prisma.lead.count({
                    where: {
                        assignedToId: user.id,
                        isDeleted: false,
                        isDone: false
                    }
                });

                return { ...user, leadCount };
            })
        );

        // Filter by max active leads
        if (filters?.maxActiveLeads) {
            return usersWithCounts.filter(u => u.leadCount < filters.maxActiveLeads!);
        }

        return usersWithCounts;
    }

    /**
     * Round Robin assignment - cycles through users sequentially
     */
    private static roundRobinAssignment(
        tenantId: string,
        users: (User & { leadCount: number })[]
    ): string | null {
        if (users.length === 0) return null;

        // Get current index
        const currentIndex = roundRobinState.get(tenantId) || 0;

        // Get next user
        const nextIndex = currentIndex % users.length;
        const selectedUser = users[nextIndex];

        // Update state
        roundRobinState.set(tenantId, nextIndex + 1);

        return selectedUser.id;
    }

    /**
     * Least Loaded assignment - assigns to user with fewest active leads
     */
    private static leastLoadedAssignment(
        users: (User & { leadCount: number })[]
    ): string | null {
        if (users.length === 0) return null;

        // Sort by lead count ascending
        const sorted = [...users].sort((a, b) => a.leadCount - b.leadCount);

        return sorted[0].id;
    }

    /**
     * Territory Based assignment - matches lead location with user territory
     */
    private static async territoryBasedAssignment(
        users: (User & { leadCount: number })[],
        leadData?: Record<string, unknown>,
        territoryField?: string
    ): Promise<string | null> {
        if (users.length === 0) return null;

        // Get lead territory
        const leadTerritory = leadData?.[territoryField || 'companyLocation'] as string;

        if (!leadTerritory) {
            // Fallback to round robin if no territory
            return users[0].id;
        }

        // Try to find users with matching territory
        // This is a simplified version - in production, would use a proper territory mapping
        const matchingUsers = users.filter(user => {
            // Check if user has territory assignment in their role or custom data
            // For now, just use a simple matching logic
            return true; // All users eligible for any territory
        });

        if (matchingUsers.length === 0) {
            return users[0].id;
        }

        // Among matching users, use least loaded
        return this.leastLoadedAssignment(matchingUsers);
    }

    /**
     * Skill Based assignment - matches lead requirements with user skills
     */
    private static skillBasedAssignment(
        users: (User & { leadCount: number })[],
        leadData?: Record<string, unknown>,
        requiredSkills?: string[]
    ): string | null {
        if (users.length === 0) return null;

        // If no skills specified, use least loaded
        if (!requiredSkills || requiredSkills.length === 0) {
            return this.leastLoadedAssignment(users);
        }

        // Score users based on skill match
        // In production, would read skills from user profile/custom fields
        const scoredUsers = users.map(user => {
            // Simplified - in real implementation would check user skills
            const skillScore = 1;
            return { user, skillScore };
        });

        // Sort by skill score descending, then by lead count ascending
        scoredUsers.sort((a, b) => {
            if (b.skillScore !== a.skillScore) {
                return b.skillScore - a.skillScore;
            }
            return a.user.leadCount - b.user.leadCount;
        });

        return scoredUsers[0]?.user.id || null;
    }

    /**
     * Weighted assignment - combines multiple factors
     */
    private static weightedAssignment(
        users: (User & { leadCount: number })[],
        leadData?: Record<string, unknown>,
        filters?: AssignmentFilters
    ): string | null {
        if (users.length === 0) return null;

        // Score each user
        const scoredUsers = users.map(user => {
            let score = 100;

            // Deduct points for current workload
            score -= user.leadCount * 2;

            // Bonus for low workload
            if (user.leadCount < 10) score += 10;
            if (user.leadCount < 5) score += 10;

            // Could add more factors like:
            // - Performance metrics
            // - Conversion rates
            // - Average response time
            // - Customer satisfaction scores

            return { user, score };
        });

        // Sort by score descending
        scoredUsers.sort((a, b) => b.score - a.score);

        return scoredUsers[0]?.user.id || null;
    }

    /**
     * Balance workload across users
     */
    static async balanceWorkload(tenantId: string): Promise<number> {
        // Get all active leads without assignment
        const unassignedLeads = await prisma.lead.findMany({
            where: {
                tenantId,
                assignedToId: null,
                isDeleted: false,
                isDone: false
            }
        });

        let assigned = 0;

        for (const lead of unassignedLeads) {
            const result = await this.assignLead(
                lead.id,
                tenantId,
                'LEAST_LOADED'
            );

            if (result.userId) {
                assigned++;
            }
        }

        return assigned;
    }

    /**
     * Reset round robin state for a tenant
     */
    static resetRoundRobin(tenantId: string): void {
        roundRobinState.delete(tenantId);
    }
}

export default AssignmentRuleEngine;
