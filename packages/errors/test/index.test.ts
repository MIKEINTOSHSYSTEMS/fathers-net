import {
  ERROR_CODES,
  FathersNetError,
  NotFoundError,
  RateLimitError,
  toErrorEnvelope,
} from '../src';

describe('@fathersnet/errors', () => {
  describe('toErrorEnvelope', () => {
    it('produces the standard envelope shape for a known error', () => {
      const err = new NotFoundError('missing');
      const envelope = toErrorEnvelope(err, 'req-123');

      expect(envelope).toEqual({
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'missing',
          request_id: 'req-123',
        },
      });
    });

    it('echoes request_id when provided', () => {
      const envelope = toErrorEnvelope(new Error('boom'), 'abc');
      expect(envelope.error.request_id).toBe('abc');
    });

    it('omits request_id when absent', () => {
      const envelope = toErrorEnvelope(new Error('boom'));
      expect(envelope.error.request_id).toBeUndefined();
    });

    it('includes errors[] for validation failures', () => {
      const err = new FathersNetError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'invalid body',
        fields: [{ field: 'phone', reason: 'not E.164' }],
      });
      const envelope = toErrorEnvelope(err);

      expect(envelope.error.errors).toEqual([{ field: 'phone', reason: 'not E.164' }]);
    });

    it('sanitizes unknown/internal errors and never leaks internals', () => {
      const envelope = toErrorEnvelope(new Error('secret stack detail: DB password 123'));

      expect(envelope.error.message).toBe('Internal server error');
      expect(envelope.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(JSON.stringify(envelope)).not.toContain('password');
    });
  });

  describe('status code mapping', () => {
    it.each([
      [ERROR_CODES.BAD_REQUEST, 400],
      [ERROR_CODES.UNAUTHORIZED, 401],
      [ERROR_CODES.FORBIDDEN, 403],
      [ERROR_CODES.NOT_FOUND, 404],
      [ERROR_CODES.CONFLICT, 409],
      [ERROR_CODES.UNPROCESSABLE_ENTITY, 422],
      [ERROR_CODES.RATE_LIMITED, 429],
      [ERROR_CODES.INTERNAL_ERROR, 500],
      [ERROR_CODES.BAD_GATEWAY, 502],
      [ERROR_CODES.SERVICE_UNAVAILABLE, 503],
    ])('maps %s to %i', (code, status) => {
      const err = new FathersNetError({ code, message: 'x' });
      expect(err.statusCode).toBe(status);
    });
  });

  describe('RateLimitError', () => {
    it('carries Retry-After seconds', () => {
      const err = new RateLimitError('slow down', 15);
      expect(err.retryAfterSeconds).toBe(15);
      expect(err.statusCode).toBe(429);
    });
  });
});
