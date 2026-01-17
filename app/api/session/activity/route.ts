import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';

export async function POST(req: NextRequest) {
    try {
        // getSession already updates lastActivityAt as a side effect!
        // So we just need to call it.
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);

        if (session) {
            return NextResponse.json({ success: true, tracking: 'active' });
        } else {
            return NextResponse.json({ success: false, message: 'No session' }, { status: 401 });
        }
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Tracking failed' }, { status: 500 });
    }
}
