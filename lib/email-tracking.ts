import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
// crypto is built-in to Node
import crypto from 'crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'fallback-secret-key-change-in-prod';

export function generateTrackingPixel(trackingId: string): string {
    return `<img src="${process.env.NEXT_PUBLIC_APP_URL}/api/email/track/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
}

export function injectTrackingPixel(htmlBody: string, trackingId: string): string {
    // Simple append, or smarter injection via regex/cheerio
    if (htmlBody.includes('</body>')) {
        return htmlBody.replace('</body>', `${generateTrackingPixel(trackingId)}</body>`);
    }
    return htmlBody + generateTrackingPixel(trackingId);
}

// Simple encryption for link wrapping
function encryptUrl(url: string): string {
    const cipher = crypto.createCipheriv('aes-256-cbc', crypto.scryptSync(TRACKING_SECRET, 'salt', 32), Buffer.alloc(16, 0));
    let encrypted = cipher.update(url, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decryptUrl(encrypted: string): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(TRACKING_SECRET, 'salt', 32), Buffer.alloc(16, 0));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export function wrapLinksWithTracking(htmlBody: string, emailId: string): string {
    const $ = cheerio.load(htmlBody);
    $('a').each((i, el) => {
        const originalUrl = $(el).attr('href');
        if (originalUrl && !originalUrl.startsWith('mailto:') && !originalUrl.startsWith('#')) {
            // Ideally we encrypt the URL + emailId to prevent tampering, or just encrypt URL and pass emailId as query param
            const encryptedUrl = encryptUrl(originalUrl);
            const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/email/track/click?url=${encryptedUrl}&emailId=${emailId}`;
            $(el).attr('href', trackingUrl);
        }
    });
    return $.html();
}

export function parseTrackedLink(encryptedUrl: string): string {
    return decryptUrl(encryptedUrl);
}
