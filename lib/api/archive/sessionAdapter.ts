/**
 * Session Adapter Module (ARCHIVED)
 * 
 * ⚠️ THIS FILE HAS BEEN ARCHIVED AND IS NO LONGER USED
 * 
 * This adapter was created during the NextAuth migration period to provide
 * a unified interface for both custom session auth and NextAuth v5. Since
 * no routes actually use NextAuth (the codebase uses custom session auth
 * exclusively), this file is preserved for reference only.
 * 
 * The withApiHandler now uses direct session retrieval via getSessionByToken.
 * 
 * If you need to implement NextAuth in the future, this code can serve as
 * a reference for normalizing NextAuth sessions to the CustomSessionData format.
 * 
 * ARCHIVED: 2026-01-24
 */

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { Session } from "next-auth";

import { getSessionByToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/authConfig";
import { CustomSessionData } from "../types";

/**
 * Generate a synthetic session ID from NextAuth user data.
 * Used when we don't have a database session ID from NextAuth.
 *
 * @param userId - The user's ID from NextAuth
 * @returns A synthetic session ID
 */
function generateSyntheticSessionId(userId: string): string {
    // Create a deterministic but unique-ish session ID from user ID + timestamp
    const timestamp = Date.now().toString(36);
    const hash = userId.split('').reduce((acc, char) => {
        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0).toString(36);
    return `nextauth_${hash}_${timestamp}`;
}

/**
 * Normalize a NextAuth session to the CustomSessionData format.
 *
 * This function extracts and maps fields from the NextAuth Session object
 * to match our internal CustomSessionData interface.
 *
 * @param nextAuthSession - The NextAuth Session object
 * @returns CustomSessionData structure with normalized fields
 */
export function normalizeNextAuthSession(nextAuthSession: Session): CustomSessionData {
    // Extract user object with type safety
    const user = nextAuthSession.user;

    if (!user) {
        throw new Error("NextAuth session missing user object");
    }

    // Map NextAuth user properties to CustomSessionData
    // NextAuth user.id comes from the session callback or adapters
    const userId = (user as any).id as string;
    if (!userId) {
        throw new Error("NextAuth user missing id");
    }

    // Role may be stored in different ways depending on NextAuth configuration
    // Check common locations and provide fallback
    const role: string = (user as any).role || 'USER';

    // TenantId may be undefined for auth routes (login, logout, etc.)
    // This is handled gracefully - callers should use skipTenantCheck for such routes
    const tenantId: string | undefined = (user as any).tenantId;

    // Generate a synthetic session ID since NextAuth doesn't provide one directly
    const sessionId = generateSyntheticSessionId(userId);

    return {
        userId,
        role,
        sessionId,
        tenantId,
    };
}

/**
 * Get the custom session token from cookies.
 *
 * @returns The session token from cookies, or null if not present
 */
async function getSessionTokenFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return token || null;
}

/**
 * Get a unified session from either custom auth or NextAuth.
 *
 * This adapter function attempts to retrieve and normalize a session from
 * the configured authentication mechanism. It returns a consistent
 * CustomSessionData structure regardless of which auth system is used.
 *
 * @param req - The NextRequest object
 * @param useNextAuth - If true, try custom session first, then fall back to NextAuth; if false, use custom session only
 * @returns CustomSessionData if authenticated, null otherwise
 *
 * @example
 * // Default: custom session auth only
 * const session = await getUnifiedSession(req);
 *
 * @example
 * // For SSO routes: try custom session first, fall back to NextAuth
 * const session = await getUnifiedSession(req, true);
 */
export async function getUnifiedSession(
    req: NextRequest,
    useNextAuth: boolean = false
): Promise<CustomSessionData | null> {
    // Always try custom session first for backward compatibility
    const token = await getSessionTokenFromCookie();
    if (token) {
        const customSession = await getSessionByToken(token);
        if (customSession) {
            return customSession;
        }
    }

    // If useNextAuth is true.and custom session is null, try NextAuth as fallback
    if (useNextAuth) {
        try {
            // Dynamic import to avoid loading NextAuth when not needed
            const { auth } = await import("@/app/api/auth/[...nextauth]/route");
            const nextAuthSession: Session | null = await auth();

            if (nextAuthSession) {
                // Normalize NextAuth session to CustomSessionData
                try {
                    return normalizeNextAuthSession(nextAuthSession);
                } catch (error) {
                    // If normalization fails, log and return null
                    console.warn("[SessionAdapter] Failed to normalize NextAuth session:", error);
                    return null;
                }
            }

            return null;
        } catch (error) {
            // If NextAuth fails entirely, return null
            console.warn("[SessionAdapter] NextAuth failed:", error);
            return null;
        }
    }

    // No session found
    return null;
}
