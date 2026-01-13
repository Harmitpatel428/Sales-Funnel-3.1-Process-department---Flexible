/**
 * Conditional Logic Engine
 * Evaluates conditions for workflow branching
 */

// Supported operators
export enum ComparisonOperator {
    EQUALS = 'EQUALS',
    NOT_EQUALS = 'NOT_EQUALS',
    GREATER_THAN = 'GREATER_THAN',
    LESS_THAN = 'LESS_THAN',
    GREATER_THAN_OR_EQUAL = 'GREATER_THAN_OR_EQUAL',
    LESS_THAN_OR_EQUAL = 'LESS_THAN_OR_EQUAL',
    CONTAINS = 'CONTAINS',
    NOT_CONTAINS = 'NOT_CONTAINS',
    STARTS_WITH = 'STARTS_WITH',
    ENDS_WITH = 'ENDS_WITH',
    MATCHES_REGEX = 'MATCHES_REGEX',
    IN = 'IN',
    NOT_IN = 'NOT_IN',
    IS_EMPTY = 'IS_EMPTY',
    IS_NOT_EMPTY = 'IS_NOT_EMPTY',
    IS_BEFORE = 'IS_BEFORE',
    IS_AFTER = 'IS_AFTER',
    IS_BETWEEN = 'IS_BETWEEN',
    IS_OLDER_THAN = 'IS_OLDER_THAN',
    IS_NEWER_THAN = 'IS_NEWER_THAN',
    IS_TRUE = 'IS_TRUE',
    IS_FALSE = 'IS_FALSE',
    IS_NULL = 'IS_NULL',
    IS_NOT_NULL = 'IS_NOT_NULL'
}

// Condition types for workflow branching
export enum ConditionType {
    IF = 'IF',
    ELSE_IF = 'ELSE_IF',
    ELSE = 'ELSE',
    AND = 'AND',
    OR = 'OR'
}

// Condition configuration
export interface ConditionConfig {
    field?: string;
    operator?: ComparisonOperator;
    value?: unknown;
    // For nested conditions (AND/OR groups)
    conditions?: ConditionConfig[];
}

// Execution context with entity and metadata
export interface ExecutionContext {
    $current: Record<string, unknown>;
    $previous?: Record<string, unknown>;
    $user?: Record<string, unknown>;
    $tenant?: Record<string, unknown>;
    $now: Date;
    [key: string]: unknown;
}

/**
 * ConditionEvaluator - Evaluates conditions for workflow branching
 */
export class ConditionEvaluator {
    /**
     * Evaluate a single condition against entity data
     */
    static evaluate(
        condition: ConditionConfig,
        context: ExecutionContext
    ): boolean {
        // If it's a group condition (AND/OR), evaluate the group
        if (condition.conditions && condition.conditions.length > 0) {
            return this.evaluateGroup(condition.conditions, condition.operator as unknown as ConditionType, context);
        }

        // Otherwise evaluate the expression
        if (!condition.field || !condition.operator) {
            return true; // No condition means always true
        }

        const fieldValue = this.resolveFieldValue(condition.field, context);
        return this.evaluateExpression(fieldValue, condition.operator, condition.value, context);
    }

    /**
     * Evaluate a group of conditions with AND/OR logic
     */
    static evaluateGroup(
        conditions: ConditionConfig[],
        operator: ConditionType,
        context: ExecutionContext
    ): boolean {
        if (conditions.length === 0) return true;

        if (operator === ConditionType.AND) {
            return conditions.every(condition => this.evaluate(condition, context));
        } else if (operator === ConditionType.OR) {
            return conditions.some(condition => this.evaluate(condition, context));
        }

        // Default: treat as AND
        return conditions.every(condition => this.evaluate(condition, context));
    }

    /**
     * Evaluate a field comparison expression
     */
    static evaluateExpression(
        fieldValue: unknown,
        operator: ComparisonOperator,
        value: unknown,
        context: ExecutionContext
    ): boolean {
        // Resolve value if it's a context reference
        const resolvedValue = this.resolveValue(value, context);

        switch (operator) {
            // Comparison operators
            case ComparisonOperator.EQUALS:
                return this.compareValues(fieldValue, resolvedValue) === 0;

            case ComparisonOperator.NOT_EQUALS:
                return this.compareValues(fieldValue, resolvedValue) !== 0;

            case ComparisonOperator.GREATER_THAN:
                return this.compareValues(fieldValue, resolvedValue) > 0;

            case ComparisonOperator.LESS_THAN:
                return this.compareValues(fieldValue, resolvedValue) < 0;

            case ComparisonOperator.GREATER_THAN_OR_EQUAL:
                return this.compareValues(fieldValue, resolvedValue) >= 0;

            case ComparisonOperator.LESS_THAN_OR_EQUAL:
                return this.compareValues(fieldValue, resolvedValue) <= 0;

            // String operators
            case ComparisonOperator.CONTAINS:
                return String(fieldValue).toLowerCase().includes(String(resolvedValue).toLowerCase());

            case ComparisonOperator.NOT_CONTAINS:
                return !String(fieldValue).toLowerCase().includes(String(resolvedValue).toLowerCase());

            case ComparisonOperator.STARTS_WITH:
                return String(fieldValue).toLowerCase().startsWith(String(resolvedValue).toLowerCase());

            case ComparisonOperator.ENDS_WITH:
                return String(fieldValue).toLowerCase().endsWith(String(resolvedValue).toLowerCase());

            case ComparisonOperator.MATCHES_REGEX:
                try {
                    const regex = new RegExp(String(resolvedValue));
                    return regex.test(String(fieldValue));
                } catch {
                    return false;
                }

            // List operators
            case ComparisonOperator.IN:
                if (Array.isArray(resolvedValue)) {
                    return resolvedValue.includes(fieldValue);
                }
                return false;

            case ComparisonOperator.NOT_IN:
                if (Array.isArray(resolvedValue)) {
                    return !resolvedValue.includes(fieldValue);
                }
                return true;

            case ComparisonOperator.IS_EMPTY:
                return this.isEmpty(fieldValue);

            case ComparisonOperator.IS_NOT_EMPTY:
                return !this.isEmpty(fieldValue);

            // Date operators
            case ComparisonOperator.IS_BEFORE:
                return this.compareDates(fieldValue, resolvedValue) < 0;

            case ComparisonOperator.IS_AFTER:
                return this.compareDates(fieldValue, resolvedValue) > 0;

            case ComparisonOperator.IS_BETWEEN:
                if (Array.isArray(resolvedValue) && resolvedValue.length === 2) {
                    const dateValue = this.toDate(fieldValue);
                    const startDate = this.toDate(resolvedValue[0]);
                    const endDate = this.toDate(resolvedValue[1]);
                    if (dateValue && startDate && endDate) {
                        return dateValue >= startDate && dateValue <= endDate;
                    }
                }
                return false;

            case ComparisonOperator.IS_OLDER_THAN:
                return this.isOlderThan(fieldValue, resolvedValue, context.$now);

            case ComparisonOperator.IS_NEWER_THAN:
                return this.isNewerThan(fieldValue, resolvedValue, context.$now);

            // Boolean operators
            case ComparisonOperator.IS_TRUE:
                return fieldValue === true || fieldValue === 'true' || fieldValue === 1;

            case ComparisonOperator.IS_FALSE:
                return fieldValue === false || fieldValue === 'false' || fieldValue === 0;

            case ComparisonOperator.IS_NULL:
                return fieldValue === null || fieldValue === undefined;

            case ComparisonOperator.IS_NOT_NULL:
                return fieldValue !== null && fieldValue !== undefined;

            default:
                return false;
        }
    }

    /**
     * Resolve a field value from the context
     * Supports dot notation: "$current.status", "$previous.assignedToId"
     */
    static resolveFieldValue(field: string, context: ExecutionContext): unknown {
        // Handle context variable references
        if (field.startsWith('$')) {
            return this.getNestedValue(field, context);
        }

        // Default to current entity
        return this.getNestedValue(`$current.${field}`, context);
    }

    /**
     * Resolve a value that might be a context reference
     */
    static resolveValue(value: unknown, context: ExecutionContext): unknown {
        if (typeof value === 'string') {
            // Handle template expressions like {{lead.name}}
            if (value.startsWith('{{') && value.endsWith('}}')) {
                const path = value.slice(2, -2).trim();
                return this.resolveFieldValue(path, context);
            }
            // Handle direct context references
            if (value.startsWith('$')) {
                return this.getNestedValue(value, context);
            }
        }
        return value;
    }

    /**
     * Get a nested value from an object using dot notation
     */
    static getNestedValue(path: string, obj: Record<string, unknown>): unknown {
        const parts = path.split('.');
        let current: unknown = obj;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = (current as Record<string, unknown>)[part];
        }

        return current;
    }

    /**
     * Compare two values, returning -1, 0, or 1
     */
    static compareValues(a: unknown, b: unknown): number {
        // Handle null/undefined
        if (a === null || a === undefined) {
            return b === null || b === undefined ? 0 : -1;
        }
        if (b === null || b === undefined) {
            return 1;
        }

        // Handle numbers
        if (typeof a === 'number' && typeof b === 'number') {
            return a - b;
        }

        // Handle dates
        const dateA = this.toDate(a);
        const dateB = this.toDate(b);
        if (dateA && dateB) {
            return dateA.getTime() - dateB.getTime();
        }

        // Handle strings
        const strA = String(a).toLowerCase();
        const strB = String(b).toLowerCase();
        return strA.localeCompare(strB);
    }

    /**
     * Check if a value is empty
     */
    static isEmpty(value: unknown): boolean {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    /**
     * Convert a value to a Date
     */
    static toDate(value: unknown): Date | null {
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date;
        }
        return null;
    }

    /**
     * Compare two dates
     */
    static compareDates(a: unknown, b: unknown): number {
        const dateA = this.toDate(a);
        const dateB = this.toDate(b);

        if (!dateA) return dateB ? -1 : 0;
        if (!dateB) return 1;

        return dateA.getTime() - dateB.getTime();
    }

    /**
     * Check if a date is older than a duration
     * Duration format: "7 days", "2 hours", "1 month", etc.
     */
    static isOlderThan(fieldValue: unknown, duration: unknown, now: Date): boolean {
        const date = this.toDate(fieldValue);
        if (!date) return false;

        const threshold = this.subtractDuration(now, String(duration));
        return date < threshold;
    }

    /**
     * Check if a date is newer than a duration
     */
    static isNewerThan(fieldValue: unknown, duration: unknown, now: Date): boolean {
        const date = this.toDate(fieldValue);
        if (!date) return false;

        const threshold = this.subtractDuration(now, String(duration));
        return date > threshold;
    }

    /**
     * Subtract a duration from a date
     * Supports: "X days", "X hours", "X minutes", "X months", "X years"
     */
    static subtractDuration(date: Date, duration: string): Date {
        const result = new Date(date);
        const match = duration.match(/^(\d+)\s*(day|days|hour|hours|minute|minutes|month|months|year|years)$/i);

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
            case 'minute':
            case 'minutes':
                result.setMinutes(result.getMinutes() - amount);
                break;
            case 'month':
            case 'months':
                result.setMonth(result.getMonth() - amount);
                break;
            case 'year':
            case 'years':
                result.setFullYear(result.getFullYear() - amount);
                break;
        }

        return result;
    }

    /**
     * Build an execution context from entity and metadata
     */
    static buildContext(
        currentData: Record<string, unknown>,
        previousData?: Record<string, unknown>,
        user?: Record<string, unknown>,
        tenant?: Record<string, unknown>
    ): ExecutionContext {
        return {
            $current: currentData,
            $previous: previousData,
            $user: user,
            $tenant: tenant,
            $now: new Date()
        };
    }
}

export default ConditionEvaluator;
