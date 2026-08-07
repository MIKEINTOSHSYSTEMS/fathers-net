import { randomBytes } from 'node:crypto';
import type {
  FastifyRequest,
  FastifyReply,
  FastifyInstance,
  RawRequestDefaultExpression,
} from 'fastify';
import type { Logger } from '@fathersnet/logger';

export const REQUEST_ID_HEADER = 'x-request-id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function sanitizeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!REQUEST_ID_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/**
 * genReqId factory (traceability, FR-022 / engineering-standards.md §6).
 * Accepts a caller-provided X-Request-Id only when it matches the allowed
 * charset/length (prevents header injection and log spoofing); otherwise
 * generates a fresh URL-safe id.
 */
export function buildGenReqId(
  fallback: () => string = () => randomBytes(16).toString('hex'),
): (req: RawRequestDefaultExpression) => string {
  return (req) => {
    // eslint-disable-next-line security/detect-object-injection -- REQUEST_ID_HEADER is a compile-time constant, not untrusted input.
    const provided = sanitizeRequestId(req.headers[REQUEST_ID_HEADER]);
    if (provided) {
      return provided;
    }
    return fallback();
  };
}

/**
 * Request ID plugin: echoes the resolved id on the response header and binds
 * it into the per-request logger as `request_id`.
 */
export async function requestIdPlugin(
  app: FastifyInstance,
  loggerFactory: (request: FastifyRequest) => Logger,
): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    request.log = loggerFactory(request).pino() as FastifyRequest['log'];
  });
}
