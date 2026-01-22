import { NextRequest, NextResponse } from 'next/server';
import { generateOpenAPISpec } from '@/lib/openapi/generator';
import {
    withApiHandler,
    ApiContext,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/docs/openapi.json
 * Serve OpenAPI spec - public endpoint (no auth required)
 */
export const GET = withApiHandler(
    { authRequired: false, checkDbHealth: false, rateLimit: false, logRequest: false },
    async (_req: NextRequest, _context: ApiContext) => {
        const spec = generateOpenAPISpec();

        return NextResponse.json(spec, {
            headers: {
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
);
