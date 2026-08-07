import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { createTestLogger } from '@fathersnet/test-utils';
import { createInMemoryEventBus, type InMemoryEventBus } from '@fathersnet/events';
import { buildJournalApp } from '../src/app';
import { loadJournalConfig } from '../src/config';
import { createMemoryJournalStore, type MemoryJournalStore } from '../src/store/memory-store';

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
const OWNER = '55555555-5555-4555-8555-555555555555';
const PARTNER = '66666666-6666-4666-8666-666666666666';
const STRANGER = '77777777-7777-4777-8777-777777777777';

function signAccessToken(subjectId: string): string {
  return jwt.sign({ role: 'father', token_version: 1, typ: 'access', sid: 'test-family' }, SECRET, {
    algorithm: 'HS256',
    issuer: 'fathersnet',
    audience: 'fathersnet-api',
    subject: subjectId,
    expiresIn: 900,
    jwtid: randomUUID(),
  });
}

function buildEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ENV: 'dev',
    FN_PORT: '3700',
    FN_SERVICE_NAME: 'journal',
    FN_JOURNAL_JWT_SECRET: SECRET,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('journal API (SRS §12.9, WP-022)', () => {
  let app: FastifyInstance;
  let store: MemoryJournalStore;
  let eventBus: InMemoryEventBus;

  async function boot(): Promise<void> {
    const config = loadJournalConfig(buildEnv());
    store = createMemoryJournalStore();
    eventBus = createInMemoryEventBus();
    const { logger } = createTestLogger('info');
    app = await buildJournalApp({ config, store, eventBus, logger });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  const ownerAuth = { authorization: `Bearer ${signAccessToken(OWNER)}` };
  const partnerAuth = { authorization: `Bearer ${signAccessToken(PARTNER)}` };
  const strangerAuth = { authorization: `Bearer ${signAccessToken(STRANGER)}` };

  it('serves liveness and readiness probes without auth', async () => {
    await boot();
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', service: 'journal' });

    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok', driver: 'memory' });
  });

  it('requires a bearer token and rejects bad tokens', async () => {
    await boot();
    const noAuth = await app.inject({ method: 'GET', url: '/v1/journal/entries' });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    const badToken = await app.inject({
      method: 'GET',
      url: '/v1/journal/entries',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(badToken.statusCode).toBe(401);
  });

  it('creates a text entry (201, private by default) and lists it newest-first', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: '   First entry   ', pregnancy_week: 20 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      entryType: 'text',
      content: 'First entry',
      pregnancyWeek: 20,
      sharedWithPartner: false,
    });
    expect(created.json().id).toMatch(/^[0-9a-f-]{36}$/i);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/journal/entries',
      headers: ownerAuth,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      items: [{ entryType: 'text', content: 'First entry' }],
      next_cursor: null,
      total: null,
    });

    // No PII on the bus.
    expect(JSON.stringify(eventBus.published[0].payload)).not.toContain('First entry');
  });

  it('honors shared_with_partner on create and the explicit /share opt-in', async () => {
    await boot();
    store.setPartner(OWNER, PARTNER);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: 'Shared from the start' },
    });
    expect(created.statusCode).toBe(201);

    const id = created.json().id as string;

    const beforeShare = await app.inject({
      method: 'GET',
      url: `/v1/journal/entries/${id}`,
      headers: partnerAuth,
    });
    expect(beforeShare.statusCode).toBe(404);

    const shared = await app.inject({
      method: 'POST',
      url: `/v1/journal/entries/${id}/share`,
      headers: ownerAuth,
    });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().sharedWithPartner).toBe(true);

    const afterShare = await app.inject({
      method: 'GET',
      url: `/v1/journal/entries/${id}`,
      headers: partnerAuth,
    });
    expect(afterShare.statusCode).toBe(200);
    expect(afterShare.json().content).toBe('Shared from the start');

    // Partner read-only: PATCH is owner-only.
    const partnerPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/journal/entries/${id}`,
      headers: partnerAuth,
      payload: { content: 'tampered' },
    });
    expect(partnerPatch.statusCode).toBe(404);
  });

  it('returns 404 (invisibility) for stranger reads and writes', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: 'Secret' },
    });
    const id = created.json().id as string;

    const read = await app.inject({
      method: 'GET',
      url: `/v1/journal/entries/${id}`,
      headers: strangerAuth,
    });
    expect(read.statusCode).toBe(404);
    expect(read.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/journal/entries/${id}`,
      headers: strangerAuth,
      payload: { content: 'hijack' },
    });
    expect(patch.statusCode).toBe(404);

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/journal/entries/${id}`,
      headers: strangerAuth,
    });
    expect(del.statusCode).toBe(404);

    // Owner's entry is still intact.
    const ownerRead = await app.inject({
      method: 'GET',
      url: `/v1/journal/entries/${id}`,
      headers: ownerAuth,
    });
    expect(ownerRead.statusCode).toBe(200);
    expect(ownerRead.json().content).toBe('Secret');
  });

  it('supports PATCH updates and unshare, and 204 DELETE', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: 'v1', shared_with_partner: true },
    });
    const id = created.json().id as string;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/v1/journal/entries/${id}`,
      headers: ownerAuth,
      payload: { content: 'v2', pregnancy_week: 24, shared_with_partner: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      content: 'v2',
      pregnancyWeek: 24,
      sharedWithPartner: false,
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/journal/entries/${id}`,
      headers: ownerAuth,
    });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/v1/journal/entries/${id}`,
      headers: ownerAuth,
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it('paginates the timeline with a cursor (06 §3.3)', async () => {
    await boot();
    for (let i = 1; i <= 5; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/v1/journal/entries',
        headers: ownerAuth,
        payload: { content: `e${i}` },
      });
    }

    const page1 = await app.inject({
      method: 'GET',
      url: '/v1/journal/entries?limit=2',
      headers: ownerAuth,
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().items.map((e: { content: string }) => e.content)).toEqual(['e5', 'e4']);
    expect(page1.json().next_cursor).toBeTruthy();

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/journal/entries?limit=2&cursor=${encodeURIComponent(page1.json().next_cursor as string)}`,
      headers: ownerAuth,
    });
    expect(page2.json().items.map((e: { content: string }) => e.content)).toEqual(['e3', 'e2']);
  });

  it('validates create bodies (required content, week bounds) with 422', async () => {
    await boot();
    const missingContent = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { pregnancy_week: 10 },
    });
    expect(missingContent.statusCode).toBe(422);

    const badWeek = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: 'x', pregnancy_week: 46 },
    });
    expect(badWeek.statusCode).toBe(422);

    const emptyContent = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: '   ' },
    });
    expect(emptyContent.statusCode).toBe(422);
  });

  it('silently strips unknown body properties (Fastify removeAdditional: true, peer precedent)', async () => {
    await boot();
    const extraField = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: ownerAuth,
      payload: { content: 'x', userId: STRANGER, media: true },
    });
    expect(extraField.statusCode).toBe(201);
    // userId in the body is ignored — ownership comes from the token sub only.
    expect(extraField.json().userId).toBe(OWNER);
    expect(extraField.json()).not.toHaveProperty('media');
  });

  it('exports a portable JSON artifact for the owner only', async () => {
    await boot();
    store.setPartner(OWNER, PARTNER);
    for (const content of ['a', 'b']) {
      await app.inject({
        method: 'POST',
        url: '/v1/journal/entries',
        headers: ownerAuth,
        payload: { content },
      });
    }
    await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: partnerAuth,
      payload: { content: 'partner-only' },
    });

    const exportRes = await app.inject({
      method: 'GET',
      url: '/v1/journal/export',
      headers: ownerAuth,
    });
    expect(exportRes.statusCode).toBe(200);
    const artifact = exportRes.json();
    expect(artifact.schema_version).toBe(1);
    expect(artifact.entry_count).toBe(2);
    expect(artifact.entries.map((e: { content: string }) => e.content)).toEqual(['a', 'b']);
    expect(JSON.stringify(artifact)).not.toContain('partner-only');
    expect(JSON.stringify(artifact)).not.toContain(OWNER);
  });

  it('reserves POST /v1/journal/media as 501 (WP-060 deferral)', async () => {
    await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/journal/media',
      headers: ownerAuth,
      payload: { filename: 'voice.ogg' },
    });
    expect(res.statusCode).toBe(501);
  });

  it('returns 404 for unknown routes and malformed ids', async () => {
    await boot();
    const unknown = await app.inject({
      method: 'GET',
      url: '/v1/journal/nope',
      headers: ownerAuth,
    });
    expect(unknown.statusCode).toBe(404);

    const badId = await app.inject({
      method: 'GET',
      url: '/v1/journal/entries/not-a-uuid',
      headers: ownerAuth,
    });
    expect(badId.statusCode).toBe(422);
  });

  it('echoes the request id on the response and error envelopes', async () => {
    await boot();
    const requestId = randomUUID();
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/journal/entries',
      headers: { ...ownerAuth, 'x-request-id': requestId },
      payload: {},
    });
    expect(bad.json().error.request_id).toBe(requestId);
    expect(bad.headers['x-request-id']).toBe(requestId);
  });
});
