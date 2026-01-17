import { NextRequest } from 'next/server';

const sessionActivityCache = new Map<string, number>();

export async function updateSessionActivity(req: NextRequest): Promise<void> {
    // Optimization: Skip for static assets and next internal routes
    if (
        req.nextUrl.pathname.startsWith('/_next') ||
        req.nextUrl.pathname.startsWith('/static') ||
        req.nextUrl.pathname.endsWith('.ico')
    ) {
        return;
    }

    const token = req.cookies.get('session_token')?.value;
    if (!token) return;

    // Throttle updates to once per minute to reduce API calls
    const lastUpdate = sessionActivityCache.get(token);
    if (lastUpdate && Date.now() - lastUpdate < 60000) return;

    try {
        sessionActivityCache.set(token, Date.now());

        // Fire and forget fetch to internal API
        // We use absolute URL needed for server-side fetches
        const url = req.nextUrl.clone();
        url.pathname = '/api/session/activity';

        fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': req.headers.get('cookie') || '',
            },
        }).catch(err => console.error('Background session tracking failed', err));

        // Cleanup cache occasionally
        if (sessionActivityCache.size > 10000) {
            sessionActivityCache.clear();
        }
    } catch (error) {
        // Ignore errors here to not block the request
        console.error('Failed to update session activity:', error);
    }
}
