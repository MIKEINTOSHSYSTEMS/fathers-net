export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_GATEWAY: 'BAD_GATEWAY',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorField {
  field: string;
  reason: string;
}

/**
 * Standard error envelope (engineering-standards.md §5). Every failure response
 * across the platform uses exactly this shape. `request_id` echoes the
 * `X-Request-Id` header; `errors[]` is populated for validation failures only.
 */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    request_id?: string;
    errors?: ErrorField[];
  };
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  VALIDATION_ERROR: 422,
};

export function httpStatusForCode(code: ErrorCode): number {
  // eslint-disable-next-line security/detect-object-injection -- `code` is a member of the closed ErrorCode union.
  return STATUS_BY_CODE[code];
}

export interface FathersNetErrorOptions {
  code?: ErrorCode;
  message: string;
  statusCode?: number;
  fields?: ErrorField[];
  cause?: unknown;
  expose?: boolean;
}

/**
 * Base application error. `expose` controls whether the message may be returned
 * to the client; internal failures default to a sanitized message.
 */
export class FathersNetError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly fields?: ErrorField[];
  readonly expose: boolean;
  readonly causeDetail?: unknown;

  constructor(options: FathersNetErrorOptions) {
    super(options.message);
    this.name = 'FathersNetError';
    this.code = options.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.statusCode = options.statusCode ?? httpStatusForCode(this.code) ?? 500;
    this.fields = options.fields;
    this.expose = options.expose ?? this.statusCode < 500;
    this.causeDetail = options.cause;
    Error.captureStackTrace?.(this, FathersNetError);
  }
}

export class ValidationError extends FathersNetError {
  constructor(message: string, fields?: ErrorField[]) {
    super({ code: ERROR_CODES.VALIDATION_ERROR, message, fields });
    this.name = 'ValidationError';
  }
}

export class BadRequestError extends FathersNetError {
  constructor(message: string, fields?: ErrorField[]) {
    super({ code: ERROR_CODES.BAD_REQUEST, message, fields });
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends FathersNetError {
  constructor(message = 'Unauthorized') {
    super({ code: ERROR_CODES.UNAUTHORIZED, message });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends FathersNetError {
  constructor(message = 'Forbidden') {
    super({ code: ERROR_CODES.FORBIDDEN, message });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends FathersNetError {
  constructor(message = 'Not found') {
    super({ code: ERROR_CODES.NOT_FOUND, message });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends FathersNetError {
  constructor(message: string) {
    super({ code: ERROR_CODES.CONFLICT, message });
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends FathersNetError {
  constructor(
    message = 'Too many requests',
    readonly retryAfterSeconds?: number,
  ) {
    super({ code: ERROR_CODES.RATE_LIMITED, message });
    this.name = 'RateLimitError';
  }
}

export class InternalError extends FathersNetError {
  constructor(message = 'Internal server error', cause?: unknown) {
    super({ code: ERROR_CODES.INTERNAL_ERROR, message, cause });
    this.name = 'InternalError';
  }
}

export class ServiceUnavailableError extends FathersNetError {
  constructor(message = 'Service unavailable') {
    super({ code: ERROR_CODES.SERVICE_UNAVAILABLE, message });
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Convert any thrown value into a standard error envelope. Never includes
 * stack traces, PII, or internals (FR-022, engineering-standards.md §5/§6).
 */
export function toErrorEnvelope(err: unknown, requestId?: string): ErrorEnvelope {
  const known =
    err instanceof FathersNetError ? err : new InternalError('Internal server error', err);

  const envelope: ErrorEnvelope = {
    error: {
      code: known.code,
      message: known.expose ? known.message : 'Internal server error',
    },
  };

  if (requestId) {
    envelope.error.request_id = requestId;
  }
  if (known.fields && known.fields.length > 0) {
    envelope.error.errors = known.fields;
  }

  return envelope;
}
