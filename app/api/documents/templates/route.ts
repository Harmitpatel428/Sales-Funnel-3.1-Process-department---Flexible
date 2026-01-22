/**
 * Document Templates API
 * GET /api/documents/templates - Get required documents list
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// Static template definitions for now
// In future, these could be stored in DB per Tenant
const DOCUMENT_TEMPLATES = {
    'AGRI': [
        { type: '7/12 Extract', required: true, description: 'Land ownership record matching 7/12' },
        { type: '8-A Extract', required: true, description: 'Land account document' },
        { type: 'Aadhar Card', required: true, description: 'Applicant identity proof' },
        { type: 'Village Map', required: false, description: 'Map of the village with land marking' },
    ],
    'RESIDENTIAL': [
        { type: 'Electricity Bill', required: true, description: 'Latest electricity bill' },
        { type: 'Index-2', required: true, description: 'Registered property document' },
        { type: 'Aadhar Card', required: true, description: 'Applicant identity proof' },
        { type: 'Tax Bill', required: false, description: 'Property tax receipt' },
    ],
    'COMMERCIAL': [
        { type: 'GST Certificate', required: true, description: 'GST Registration proof' },
        { type: 'Udhyam Aadhar', required: true, description: 'MSME registration' },
        { type: 'Shop Act License', required: false, description: 'Gumasthadhara license' },
        { type: 'Electricity Bill', required: true, description: 'Latest electricity bill' },
        { type: 'Building Plan', required: false, description: 'Approved building plan' },
    ],
    'DEFAULT': [
        { type: 'Aadhar Card', required: true, description: 'Identity proof' },
        { type: 'PAN Card', required: true, description: 'Tax identity proof' },
        { type: 'Address Proof', required: true, description: 'Electricity bill or similar' },
    ]
};

const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    // Auth is handled by wrapper, session is guaranteed if authRequired=true
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'DEFAULT';

    const checklist = DOCUMENT_TEMPLATES[category as keyof typeof DOCUMENT_TEMPLATES] || DOCUMENT_TEMPLATES['DEFAULT'];

    return NextResponse.json({
        success: true,
        category,
        checklist
    });
};

export const GET = withApiHandler({ authRequired: true, checkDbHealth: false, rateLimit: 100 }, getHandler);
