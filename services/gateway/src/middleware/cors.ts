import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config';

/**
 * CORS allow-list (06 §12.1). Only origins explicitly listed in the
 * FN_CORS_ORIGINS config receive cross-origin access; requests without an
 * Origin header (same-origin, non-browser clients, health probes) are always
 * allowed.
 */
export async function corsPlugin(app: FastifyInstance, config: GatewayConfig): Promise<void> {
  const origins = config.FN_CORS_ORIGINS;

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    maxAge: 600,
  });
}
