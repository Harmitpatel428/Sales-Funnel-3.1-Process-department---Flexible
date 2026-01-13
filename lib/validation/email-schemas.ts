import { z } from 'zod';

export const EmailSendSchema = z.object({
    to: z.string().email().or(z.array(z.string().email())),
    subject: z.string().min(1),
    htmlBody: z.string(),
    providerId: z.string().optional(),
    leadId: z.string().optional(),
    caseId: z.string().optional(),
    replyToEmailId: z.string().optional(),
    attachments: z.array(z.any()).optional()
});

export const EmailTemplateSchema = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    htmlBody: z.string(),
    category: z.string().optional()
});

export const EmailCampaignSchema = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    htmlBody: z.string(),
    targetLeadIds: z.array(z.string()).min(1),
    scheduledAt: z.string().optional()
});

export const CalendarEventSchema = z.object({
    title: z.string().min(1),
    startTime: z.string(),
    endTime: z.string(),
    leadId: z.string().optional(),
    caseId: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string().email()).optional()
});
