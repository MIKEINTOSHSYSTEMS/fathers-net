import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { toErrorEnvelope, ERROR_CODES, FathersNetError } from '@fathersnet/errors';
import type { GatewayConfig } from '../config';
import type { IdempotencyStore, StoredIdempotencyResult } from '../services/idempotency';
import { REQUEST_ID_HEADER } from './request-id';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KEY_PATTERN = /^[\x21-\x7E]{8,128}$/;

interface IdempotencyState {
  fullKey: string;
  claimed: boolean;
}

const state = new WeakMap<FastifyRequest, IdempotencyState>();

function isIdempotencyRequest(request: FastifyRequest): boolean {
  return IDEMPOTENT_METHODS.has(request.method);
}

function keyForRequest(request: FastifyRequest, key: string): string {
  const hash = createHash('sha256').update(`${request.method}:${request.url}:${key}`).digest('hex');
  return `idempotency:${hash}`;
}

/**
 * Per-request idempotency (06 §2.3 / FR-161). Accepts an optional
 * `Idempotency-Key` header on mutating methods; when present the first
 * request claims the slot atomically and its response is stored and replayed
 * for retries. Server errors (>500) release the slot so the client can retry.
 */
export async function idempotencyPlugin(
  app: FastifyInstance,
  deps: { store: IdempotencyStore; config: GatewayConfig },
): Promise<void> {
  const { store, config } = deps;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isIdempotencyRequest(request)) {
      return;
    }
    const key = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    if (!key) {
      return;
    }
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      reply.status(400).send(
        toErrorEnvelope(
          new FathersNetError({
            code: ERROR_CODES.BAD_REQUEST,
            message: `Invalid ${IDEMPOTENCY_KEY_HEADER} header. Must be 8-128 printable ASCII characters.`,
          }),
          request.id,
        ),
      );
      return;
    }

    const fullKey = keyForRequest(request, key);
    state.set(request, { fullKey, claimed: false });

    const claimed = await store.claim(fullKey, config.FN_IDEMPOTENCY_TTL_SECONDS);
    if (!claimed) {
      const stored = await store.get(fullKey);
      if (stored) {
        reply.header('X-Idempotency-Replayed', 'true');
        reply.status(stored.statusCode).headers(stored.headers).send(stored.body);
        return;
      }
      reply.status(409).send(
        toErrorEnvelope(
          new FathersNetError({
            code: ERROR_CODES.CONFLICT,
            message: 'Idempotency key is already being processed.',
          }),
          request.id,
        ),
      );
      return;
    }

    state.set(request, { fullKey, claimed: true });
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const entry = state.get(request);
    if (!entry?.claimed) {
      return payload;
    }
    if (reply.statusCode >= 500) {
      await store.delete(entry.fullKey);
      return payload;
    }
    const stored: StoredIdempotencyResult = {
      statusCode: reply.statusCode,
      headers: {
        'content-type': String(reply.getHeader('content-type') ?? 'application/json'),
        [REQUEST_ID_HEADER]: String(reply.getHeader(REQUEST_ID_HEADER) ?? request.id),
      },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload ?? ''),
    };
    await store.save(entry.fullKey, stored, config.FN_IDEMPOTENCY_TTL_SECONDS);
    return payload;
  });
}
