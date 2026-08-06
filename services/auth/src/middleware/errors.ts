import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FastifyError } from 'fastify';
import {
  toErrorEnvelope,
  ERROR_CODES,
  FathersNetError,
  RateLimitError,
  type ErrorCode,
} from '@fathersnet/errors';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  422: ERROR_CODES.VALIDATION_ERROR,
  429: ERROR_CODES.RATE_LIMITED,
};

/**
 * Global error handler producing the standard envelope
 * (engineering-standards.md §5). Never leaks stack traces or internals for
 * 5xx; sanitizes via toErrorEnvelope. 4xx pass through with their code.
 * Rate-limit/lockout responses carry a Retry-After header (contract §12.2).
 */
export function errorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send(
      toErrorEnvelope(
        new FathersNetError({
          code: ERROR_CODES.NOT_FOUND,
          message: `Route ${request.method} ${request.url} not found`,
        }),
        request.id,
      ),
    );
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    if (error.validation) {
      const fields = error.validation.map((issue) => ({
        field: String(issue.instancePath || 'body'),
        reason: String(issue.message || 'invalid'),
      }));
      reply.status(422).send(
        toErrorEnvelope(
          new FathersNetError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid request',
            fields,
          }),
          requestId,
        ),
      );
      return;
    }

    if (error.statusCode && error.statusCode < 500) {
      if (error instanceof RateLimitError && error.retryAfterSeconds) {
        reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      reply.status(error.statusCode).send(
        toErrorEnvelope(
          new FathersNetError({
            code: CODE_BY_STATUS[error.statusCode] ?? ERROR_CODES.BAD_REQUEST,
            message: error.message,
          }),
          requestId,
        ),
      );
      return;
    }

    request.log.error(
      { event: 'http.error', err_code: error.code, err_message: error.message },
      'unhandled request error',
    );
    reply.status(500).send(toErrorEnvelope(error, requestId));
  });
}
