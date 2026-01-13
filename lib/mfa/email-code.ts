import { sendEmail } from '@/lib/email';
import { mfaVerificationTemplate } from '@/lib/email-templates';

export async function sendEmailCode(email: string, code: string) {
    const html = mfaVerificationTemplate(code);
    const result = await sendEmail({
        to: email,
        subject: 'Your Verification Code',
        html,
    });
    return result;
}
