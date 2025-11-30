import { NextResponse } from 'next/server';

interface ApiSuccessResponse<T> {
  data: T;
  error: null;
  meta?: Record<string, unknown>;
}

interface ApiErrorResponse {
  data: null;
  error: string;
}

export function respondSuccess<T>(
  data: T,
  options?: { status?: number; meta?: Record<string, unknown> }
) {
  const payload: ApiSuccessResponse<T> = {
    data,
    error: null,
    ...(options?.meta ? { meta: options.meta } : {}),
  };

  return NextResponse.json(payload, { status: options?.status ?? 200 });
}

export function respondError(message: string, status = 400) {
  const payload: ApiErrorResponse = {
    data: null,
    error: message,
  };
  return NextResponse.json(payload, { status });
}

export function formatZodError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues: Array<{ message: string }> }).issues)
  ) {
    const issues = (error as { issues: Array<{ message: string }> }).issues;
    return issues.map((issue) => issue.message).join(', ');
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected validation error';
}

