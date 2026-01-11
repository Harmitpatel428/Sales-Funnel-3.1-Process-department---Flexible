'use server';

import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { requireRole } from './auth';
import { addServerAuditLog } from './audit';

// ============================================================================
// USER MANAGEMENT SERVER ACTIONS
// ============================================================================

export interface UserData {
    id: string;
    username: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
}

/**
 * Get all users (Admin only).
 */
export async function getUsers(): Promise<UserData[]> {
    await requireRole(['ADMIN']);

    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    return users;
}

/**
 * Create a new user (Admin only).
 */
export async function createUserAction(data: {
    username: string;
    name: string;
    email: string;
    password: string;
    role: string;
}): Promise<{ success: boolean; message: string; userId?: string }> {
    try {
        const session = await requireRole(['ADMIN']);

        // Check for duplicate username
        const existingUsername = await prisma.user.findUnique({
            where: { username: data.username.toLowerCase() },
        });
        if (existingUsername) {
            return { success: false, message: 'Username already exists' };
        }

        // Check for duplicate email
        const existingEmail = await prisma.user.findUnique({
            where: { email: data.email.toLowerCase() },
        });
        if (existingEmail) {
            return { success: false, message: 'Email already exists' };
        }

        const hashedPassword = await hashPassword(data.password);

        const user = await prisma.user.create({
            data: {
                username: data.username.toLowerCase(),
                name: data.name,
                email: data.email.toLowerCase(),
                password: hashedPassword,
                role: data.role,
                isActive: true,
            },
        });

        await addServerAuditLog({
            actionType: 'USER_CREATED',
            entityType: 'user',
            entityId: user.id,
            performedById: session.userId,
            description: `User "${user.name}" (${user.role}) created`,
            metadata: { createdUserRole: user.role, createdUserEmail: user.email },
        });

        return { success: true, message: 'User created successfully', userId: user.id };
    } catch (error) {
        console.error('Create user error:', error);
        return { success: false, message: 'Failed to create user' };
    }
}

/**
 * Update a user (Admin only).
 */
export async function updateUserAction(
    userId: string,
    updates: { name?: string; email?: string; role?: string; isActive?: boolean; password?: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const session = await requireRole(['ADMIN']);

        const existingUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!existingUser) {
            return { success: false, message: 'User not found' };
        }

        const updateData: Record<string, unknown> = {};
        if (updates.name) updateData.name = updates.name;
        if (updates.email) updateData.email = updates.email.toLowerCase();
        if (updates.role) updateData.role = updates.role;
        if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
        if (updates.password) updateData.password = await hashPassword(updates.password);

        await prisma.user.update({
            where: { id: userId },
            data: updateData,
        });

        await addServerAuditLog({
            actionType: updates.isActive === false ? 'USER_DEACTIVATED' : updates.isActive === true ? 'USER_ACTIVATED' : 'USER_UPDATED',
            entityType: 'user',
            entityId: userId,
            performedById: session.userId,
            description: `User "${existingUser.name}" updated`,
            metadata: { updates: Object.keys(updates) },
        });

        return { success: true, message: 'User updated successfully' };
    } catch (error) {
        console.error('Update user error:', error);
        return { success: false, message: 'Failed to update user' };
    }
}

/**
 * Delete a user (Admin only).
 */
export async function deleteUserAction(userId: string): Promise<{ success: boolean; message: string }> {
    try {
        const session = await requireRole(['ADMIN']);

        // Prevent deleting yourself
        if (session.userId === userId) {
            return { success: false, message: 'Cannot delete your own account' };
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        await prisma.user.delete({ where: { id: userId } });

        await addServerAuditLog({
            actionType: 'USER_DELETED',
            entityType: 'user',
            entityId: userId,
            performedById: session.userId,
            description: `User "${user.name}" deleted`,
            metadata: { deletedUserRole: user.role, deletedUserEmail: user.email },
        });

        return { success: true, message: 'User deleted successfully' };
    } catch (error) {
        console.error('Delete user error:', error);
        return { success: false, message: 'Failed to delete user' };
    }
}

/**
 * Reset a user's password (Admin only).
 */
export async function resetUserPasswordAction(userId: string): Promise<{ success: boolean; message: string; newPassword?: string }> {
    try {
        const session = await requireRole(['ADMIN']);

        // Prevent resetting own password
        if (session.userId === userId) {
            return { success: false, message: 'Cannot reset your own password. Use profile settings instead.' };
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        // Generate secure random password
        const newPassword = generateSecurePassword();
        const hashedPassword = await hashPassword(newPassword);

        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                passwordLastChangedAt: new Date(),
            },
        });

        await addServerAuditLog({
            actionType: 'USER_PASSWORD_RESET_BY_ADMIN',
            entityType: 'user',
            entityId: userId,
            performedById: session.userId,
            description: `Admin reset password for user "${user.name}"`,
            metadata: { targetUserId: userId, targetUserName: user.name },
        });

        return { success: true, message: 'Password reset successfully', newPassword };
    } catch (error) {
        console.error('Reset password error:', error);
        return { success: false, message: 'Failed to reset password' };
    }
}

/**
 * Generate a secure random password.
 */
function generateSecurePassword(): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    const allChars = lowercase + uppercase + numbers + symbols;

    let password = '';
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = 0; i < 8; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
}
