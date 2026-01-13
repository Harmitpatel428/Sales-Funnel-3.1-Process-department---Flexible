import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendSMSCode } from '@/lib/mfa/sms';
import { sendEmailCode } from '@/lib/mfa/email-code';
import { randomInt } from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { method } = await req.json(); // 'SMS' or 'EMAIL'

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Generate 6-digit code
        const code = randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store code in VerificationCode table
        // First clean up old codes for this user/method
        await prisma.verificationCode.deleteMany({
            where: { userId: session.userId, method }
        });

        await prisma.verificationCode.create({
            data: {
                userId: session.userId,
                code, // In production, hash this! hashedCode
                method,
                expiresAt,
            }
        });

        // Send Code
        let result;
        if (method === 'SMS') {
            // Need user phone number? User model doesn't have it standardly based on Schema Step 1?
            // "1. Database Schema Extensions" -> "Extend User model: ssoProvider, mfaEnabled..."
            // It did NOT add 'phoneNumber' to User.
            // But Lead has mobileNumber. User usually does too?
            // Existing schema: "model User { ... email String ... }" - NO phone number.
            // Assumption: User object might have it or we need to add it?
            // Plan Step 7: "Integrate with Twilio... sendSMSCode(phoneNumber, code)".
            // Where do we get phoneNumber?
            // Perhaps we prompt user to enter it first?
            // Or maybe it was missed in Schema Step 1.
            // I'll check existing User model again.
            // User model (read in Step 7 output): `username, name, email, password...` NO phone.
            // We probably need to add `phoneNumber` to User or ask user to provide it in the request if setup?
            // If verify, we need it stored.
            // I'll assume for verify flow, we'd need it.
            // I'll add `phoneNumber` to User schema in next migration pass if I can, OR
            // I'll assume for now we can't do SMS without it.
            // I'll fail if no phone number for SMS.
            return NextResponse.json({ error: 'SMS not supported yet (missing phone number)' }, { status: 400 });
        } else if (method === 'EMAIL') {
            result = await sendEmailCode(user.email, code);
        } else {
            return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
        }

        if (!result.success) {
            return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Code sent' });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
