
import { prisma } from '../lib/db';
import { convertEmailToLead } from '../lib/email-to-lead';

async function main() {
    console.log('🔄 Starting Manual Verification: Email Sync & Parsing...');

    const tenantSlug = 'verify-sync-tenant';
    const tenant = await prisma.tenant.upsert({
        where: { slug: tenantSlug },
        update: {},
        create: { name: 'Verify Sync Tenant', slug: tenantSlug, isActive: true }
    });

    // Scenario 1: Unknown Email -> New Lead
    console.log('\n🧪 Scenario 1: Parsing unknown email...');
    const unknownEmail = `unknown-${Date.now()}@example.com`;

    // Create a dummy email record first (to simulate syncing)
    const emailRecord1 = await prisma.email.create({
        data: {
            messageId: `msg-1-${Date.now()}`,
            subject: 'New Inquiry',
            from: unknownEmail,
            to: JSON.stringify(['support@company.com']),
            textBody: 'Hello, I am interested.',
            status: 'RECEIVED',
            direction: 'INBOUND', // Fixed
            tenantId: tenant.id
        }
    });

    const result1 = await convertEmailToLead({
        id: emailRecord1.id,
        from: unknownEmail,
        subject: 'New Inquiry',
        textBody: 'Hello, I am interested.',
        tenantId: tenant.id
    });

    if (result1.leadId) {
        console.log('✅ Lead created:', result1.leadId);
        const lead = await prisma.lead.findUnique({ where: { id: result1.leadId } });
        if (lead && lead.email === unknownEmail) console.log('✅ Lead email matches');
        else console.error('❌ Lead email mismatch');
    } else {
        console.error('❌ Failed to create lead for unknown email');
    }

    // Scenario 2: Email Body with Phone Number -> Match Existing Case
    console.log('\n🧪 Scenario 2: Matching existing case via phone number in body...');

    // Create a lead and case with a specific phone number
    const phone = '+15550009999';
    const existingLead = await prisma.lead.create({
        data: {
            clientName: 'Existing User',
            email: `existing-${Date.now()}@test.com`,
            mobileNumber: phone,
            tenantId: tenant.id,
            status: 'NEW'
        }
    });

    const caseId = `case-${Date.now()}`;
    const existingCase = await prisma.case.create({
        data: {
            caseId: caseId,
            caseNumber: `CN-${Date.now()}`,
            // title: 'Existing Issue', // Error: 'title' does not exist on Case model? Checked schema, it does NOT have title.
            // Wait, schema for Case: caseId, leadId, caseNumber, schemeType, caseType, benefitTypes, assignedProcessUserId, assignedRole, processStatus, priority, closedAt, closureReason, clientName, company, mobileNumber, consumerNumber, kva, contacts, talukaCategory, termLoanAmount, plantMachineryValue, electricityLoad, electricityLoadType, originalLeadData, createdAt, updatedAt, tenantId.
            // It does NOT have 'title'. It has 'clientName' or others.
            // I will use 'clientName' or just rely on IDs.
            // status: 'OPEN', // Error: 'status' does not exist? It has 'processStatus'.
            processStatus: 'PENDING',
            priority: 'HIGH',
            tenantId: tenant.id,
            leadId: existingLead.id,
            updatedAt: new Date(),
            contacts: JSON.stringify([{ type: 'mobile', value: phone }]) // Store phone in JSON contacts often used
        }
    });

    // Create email with that phone nbr in body
    // Using a different email address to prove it matches by phone, not email
    const senderEmail = `other-${Date.now()}@sender.com`;
    const emailRecord2 = await prisma.email.create({
        data: {
            messageId: `msg-2-${Date.now()}`,
            subject: 'Urgent Help',
            from: senderEmail,
            to: JSON.stringify(['support@company.com']),
            textBody: `Call me back at ${phone} please.`,
            status: 'RECEIVED',
            direction: 'INBOUND',
            tenantId: tenant.id
        }
    });

    const result2 = await convertEmailToLead({
        id: emailRecord2.id,
        from: senderEmail,
        subject: 'Urgent Help',
        textBody: `Call me back at ${phone} please.`, // Phone in body
        tenantId: tenant.id
    });

    if (result2.caseId === existingCase.caseId) {
        console.log('✅ Correctly matched Case ID:', result2.caseId);
    } else {
        console.error(`❌ Case Match Failed. Expected ${existingCase.caseId}, got ${result2.caseId}`);
        // Debug
        console.log('Existing Case Contacts:', existingCase.contacts);
    }

    // Verify Activity Log for Email 2
    const activity = await prisma.activityLog.findFirst({
        where: {
            tenantId: tenant.id,
            metadata: { contains: emailRecord2.id }
        }
    });

    if (activity) {
        console.log('✅ Activity Log created:', activity.description);
    } else {
        console.error('❌ Activity Log missing');
    }

    console.log('\n🎉 Verification Completed');
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
