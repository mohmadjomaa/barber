import { HttpErrorResponse } from '@angular/common/http';

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: unknown } | string | null;

    if (typeof body === 'string' && body.trim()) {
      return body;
    }

    if (body && typeof body === 'object' && typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
