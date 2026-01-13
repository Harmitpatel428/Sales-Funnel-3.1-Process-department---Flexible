// SMS Utility using Twilio
// Note: Requires Twilio credentials in env

export async function sendSMSCode(phoneNumber: string, code: string) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        console.warn("Twilio not configured. Logging SMS code:", code);
        return { success: false, error: "SMS service not configured" };
    }

    try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        const message = await client.messages.create({
            body: `Your verification code is: ${code}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });

        return { success: true, messageId: message.sid };
    } catch (error: any) {
        console.error("SMS Send Error:", error);
        return { success: false, error: error.message };
    }
}
