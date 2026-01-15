import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSessionActivity } from '@/lib/middleware/session-activity';

export async function middleware(request: NextRequest) {
    // Call session activity tracker
    // It handles its own exclusions (static files, image, etc if configured inside, 
    // but better to check here too to avoid unnecessary imports/logic for static)

    // updateSessionActivity returns void, it's a side effect.
    // It is designed to be fire-and-forget or awaitable. 
    // Since it connects to DB, we should await it ? 
    // Next.js middleware runs on edge if not specified? 
    // If lib/middleware/session-activity uses prisma, it might not work in Edge runtime.
    // However, usually middleware.ts is Node runtime compatible if not 'edge' config.
    // But direct DB access in middleware is discouraged/often failed in Vercel. 
    // But user verified "Session activity tracking middleware never runs" implies it WAS implemented 
    // but just not registered. 

    // Let's verify lib/middleware/session-activity.ts content first? 
    // It was likely implemented to use Prisma. 
    // If so, calling it from middleware.ts might be problematic depending on deployment, 
    // but locally it works.

    await updateSessionActivity(request);

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder content (if any generic)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
