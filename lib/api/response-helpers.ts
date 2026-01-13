import { NextResponse } from 'next/server';

export function successResponse<T>(data: T, message?: string) {
    return NextResponse.json({ success: true, data, message }, { status: 200 });
}

export function errorResponse(message: string, errors?: string[], status: number = 500) {
    return NextResponse.json({ success: false, message, errors }, { status });
}

export function notFoundResponse(entity: string = 'Resource') {
    return errorResponse(`${entity} not found`, undefined, 404);
}

export function unauthorizedResponse() {
    return errorResponse('Unauthorized', undefined, 401);
}

export function forbiddenResponse() {
    return errorResponse('Forbidden', undefined, 403);
}

export function validationErrorResponse(errors: string[]) {
    return errorResponse('Validation Error', errors, 400);
}
