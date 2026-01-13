import { prisma } from '@/lib/db';

interface EmailConvertData {
    id?: string;
    from: string;
    subject: string;
    tenantId: string;
    htmlBody?: string;
    textBody?: string;
}

export async function convertEmailToLead(emailData: EmailConvertData) {
    const fromEmail = emailData.from.match(/<(.+)>/)?.[1] || emailData.from.trim();
    // 2. Extract Phone Number (from Subject, Body, and From)
    // Regex for E.164 or common formats (10-15 digits)
    const phoneRegex = /\b\+?\d{10,15}\b/g;

    // Combine text to search for phone
    const fullText = `${emailData.subject} ${emailData.textBody || ''} ${emailData.htmlBody || ''} ${emailData.from}`;
    const potentialPhones = fullText.match(phoneRegex) || [];
    const fromPhone = potentialPhones.length > 0 ? potentialPhones[0] : undefined;

    // 3. Search for existing Lead
    let lead = await prisma.lead.findFirst({
        where: {
            tenantId: emailData.tenantId,
            OR: [
                { email: fromEmail },
                { mobileNumber: fromPhone ? { contains: fromPhone } : undefined }
            ].filter(c => c !== undefined && Object.values(c)[0] !== undefined) as any
        }
    });

    // 4. Search for existing Case (Prioritize Case over Lead if found & active)
    let linkedCase = null;

    // Efficiently finding cases is hard with JSON contacts. 
    // We will pull open cases and filter in memory as a pragmatic approach for this user scale,
    // or use exact match on mobileNumber column if available.

    // Strategy: Find candidates by simple fields first.
    let caseCandidates = await prisma.case.findMany({
        where: {
            tenantId: emailData.tenantId,
            processStatus: { not: 'CLOSED' }, // Only active cases
        },
        select: { caseId: true, mobileNumber: true, contacts: true, leadId: true }
    });

    // Filter in memory for email or phone match
    linkedCase = caseCandidates.find(c => {
        // Check main mobile
        if (fromPhone && c.mobileNumber && c.mobileNumber.includes(fromPhone)) return true;

        // Check contacts JSON
        if (c.contacts && c.contacts !== '[]') {
            try {
                const contacts = JSON.parse(c.contacts);
                if (Array.isArray(contacts)) {
                    return contacts.some((contact: any) =>
                        (contact.email && contact.email.toLowerCase() === fromEmail.toLowerCase()) ||
                        (contact.value && typeof contact.value === 'string' && contact.value.toLowerCase() === fromEmail.toLowerCase()) ||
                        (fromPhone && contact.phone && contact.phone.includes(fromPhone)) ||
                        (fromPhone && contact.value && typeof contact.value === 'string' && contact.value.includes(fromPhone))
                    );
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        return false;
    });

    // If Case found, link to it and use its Lead
    if (linkedCase) {
        if (!lead || lead.id !== linkedCase.leadId) {
            lead = await prisma.lead.findUnique({ where: { id: linkedCase.leadId } });
        }
    }

    // 5. Create Lead if none found matching identifiers
    if (!lead) {
        if (fromEmail || fromPhone) {
            lead = await prisma.lead.create({
                data: {
                    clientName: emailData.from.split('<')[0].trim() || 'Unknown',
                    email: fromEmail,
                    mobileNumber: fromPhone,
                    source: 'Email',
                    status: 'NEW',
                    notes: `Auto-created from email: ${emailData.subject}\n\nPreview: ${emailData.htmlBody?.substring(0, 200) || ''}...`,
                    tenantId: emailData.tenantId
                }
            });
            console.log(`Created new lead ${lead.id} for ${fromEmail}`);
        }
    }

    // 6. Link Email and Create Activity Log
    if (emailData.id) {
        await prisma.email.update({
            where: { id: emailData.id },
            data: {
                leadId: lead?.id,
                caseId: linkedCase?.caseId
            }
        });

        if (lead || linkedCase) {
            // We added ActivityLog to schema earlier
            await (prisma as any).activityLog.create({
                data: {
                    tenantId: emailData.tenantId,
                    leadId: lead?.id,
                    caseId: linkedCase?.caseId,
                    type: 'email_inbound',
                    description: `New email from ${fromEmail}: ${emailData.subject}`,
                    metadata: JSON.stringify({ emailId: emailData.id })
                }
            });
        }

        console.log(`Linked email ${emailData.id} to lead ${lead?.id} case ${linkedCase?.caseId}`);
    }

    return { leadId: lead?.id, caseId: linkedCase?.caseId };
}
