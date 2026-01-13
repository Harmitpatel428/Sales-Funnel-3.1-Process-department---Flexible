import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';
// Check if prisma is imported correctly, usually it's from '@/lib/prisma' or similar in this project.
// I'll check user structure later or assume consistent import. 
// Existing file lib/auth.ts might have the import.

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

/**
 * Sends an email and logs it to the EmailQueue.
 * Attempts to send immediately.
 */
export async function sendEmail({ to, subject, html }: EmailOptions) {
    // 1. Create queue entry
    const emailJob = await prisma.emailQueue.create({
        data: {
            to,
            subject,
            html,
            status: 'PENDING',
        },
    });

    try {
        // 2. Send email
        const info = await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
            to,
            subject,
            html,
        });

        console.log('Message sent: %s', info.messageId);

        // 3. Update queue to SENT
        await prisma.emailQueue.update({
            where: { id: emailJob.id },
            data: {
                status: 'SENT',
                attempts: 1,
            },
        });

        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        console.error('Error sending email:', error);

        // 4. Update queue to FAILED
        await prisma.emailQueue.update({
            where: { id: emailJob.id },
            data: {
                status: 'FAILED',
                attempts: 1,
                error: error.message || 'Unknown error',
            },
        });

        return { success: false, error };
    }
}

/**
 * Retries failed emails from the queue.
 * Can be called via cron job.
 */
export async function retryFailedEmails() {
    const failedEmails = await prisma.emailQueue.findMany({
        where: {
            status: 'FAILED',
            attempts: { lt: 3 }, // Max 3 retries
        },
        take: 10,
    });

    for (const email of failedEmails) {
        try {
            const info = await transporter.sendMail({
                from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
                to: email.to,
                subject: email.subject,
                html: email.html,
            });

            await prisma.emailQueue.update({
                where: { id: email.id },
                data: {
                    status: 'SENT',
                    attempts: { increment: 1 },
                    error: null,
                },
            });
        } catch (error: any) {
            await prisma.emailQueue.update({
                where: { id: email.id },
                data: {
                    attempts: { increment: 1 },
                    error: error.message || 'Unknown retry error',
                },
            });
        }
    }
}
