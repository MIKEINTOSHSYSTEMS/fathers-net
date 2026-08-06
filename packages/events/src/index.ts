/**
 * @fathersnet/events — event bus platform foundation (WP-024a).
 * Provider-agnostic bus client, outbox relay, stream consumer + DLQ, and the
 * canonical event vocabulary (06 §2.2, 03 §4.6; FR-160/FR-161).
 */

export * from './vocabulary';
export * from './event';
export * from './bus';
export * from './consumer';
export * from './outbox';
export { createRedisClient } from './redis';
