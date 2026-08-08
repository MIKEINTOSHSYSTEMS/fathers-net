import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { createTestLogger, createRequestId } from '@fathersnet/test-utils';
import { loadContentConfig } from '../src/config';
import { buildContentApp } from '../src/app';
import {
  createMemoryContentStore,
  type MemoryContentStore,
} from '../src/services/store/memory-store';

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
const STAFF = '33333333-3333-4333-8333-333333333333';
const REVIEWER = '44444444-4444-4444-8444-444444444444';
const FATHER = '55555555-5555-4555-8555-555555555555';

function signAccessToken(subjectId: string, role = 'father'): string {
  return jwt.sign({ role, token_version: 1, typ: 'access', sid: 'test-family' }, SECRET, {
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
    FN_PORT: '3300',
    FN_SERVICE_NAME: 'content',
    FN_CONTENT_JWT_SECRET: SECRET,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

const DRAFT = {
  content_type: 'article',
  title_en: 'Safe pregnancy nutrition',
  title_am: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
  body_en: 'Eat a balanced diet during pregnancy.',
  body_am: 'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
  pregnancy_week: 12,
};

describe('content routes (SRS §12.5, WP-020)', () => {
  let app: FastifyInstance;
  let store: MemoryContentStore;

  async function boot(env: NodeJS.ProcessEnv = buildEnv()): Promise<void> {
    const config = loadContentConfig(env);
    const { logger } = createTestLogger('debug');
    store = createMemoryContentStore();
    app = await buildContentApp({ config, store, logger });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  const staffAuth = { authorization: `Bearer ${signAccessToken(STAFF, 'staff')}` };
  const reviewerAuth = { authorization: `Bearer ${signAccessToken(REVIEWER, 'staff')}` };
  const fatherAuth = { authorization: `Bearer ${signAccessToken(FATHER)}` };

  it('serves the liveness probe', async () => {
    await boot();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'content' });
  });

  it('requires a bearer token on every content route', async () => {
    await boot();
    const routes = [
      { method: 'GET', url: '/v1/content' },
      { method: 'GET', url: `/v1/content/${randomUUID()}` },
      { method: 'POST', url: '/v1/content', payload: DRAFT },
      { method: 'PUT', url: `/v1/content/${randomUUID()}`, payload: {} },
      { method: 'POST', url: `/v1/content/${randomUUID()}/submit` },
      { method: 'POST', url: `/v1/content/${randomUUID()}/approve` },
      { method: 'POST', url: `/v1/content/${randomUUID()}/archive` },
    ] as const;

    for (const route of routes) {
      const response = await app.inject(route as never);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    }

    const bogus = await app.inject({
      method: 'GET',
      url: '/v1/content',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });

  it('lists published content for any authenticated user', async () => {
    await boot();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/content',
      headers: fatherAuth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ content: [] });
  });

  it('runs the full §12.5 workflow end-to-end: draft -> update -> submit -> approve/publish -> list -> archive', async () => {
    await boot();

    // Any authenticated user may list.
    const emptyList = await app.inject({ method: 'GET', url: '/v1/content', headers: fatherAuth });
    expect(emptyList.json()).toEqual({ content: [] });

    // Create draft as staff.
    const create = await app.inject({
      method: 'POST',
      url: '/v1/content',
      headers: staffAuth,
      payload: DRAFT,
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;
    expect(create.json()).toMatchObject({
      contentType: 'article',
      status: 'draft',
      medicalReviewed: false,
      createdBy: STAFF,
    });

    // Update -> new version.
    const update = await app.inject({
      method: 'PUT',
      url: `/v1/content/${id}`,
      headers: staffAuth,
      payload: { body_en: 'Updated body.', change_note: 'Corrected dosage' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().bodyEn).toBe('Updated body.');

    // Submit.
    const submit = await app.inject({
      method: 'POST',
      url: `/v1/content/${id}/submit`,
      headers: staffAuth,
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().status).toBe('pending_medical_review');

    // Approve by a different staff member -> published, events emitted.
    const approve = await app.inject({
      method: 'POST',
      url: `/v1/content/${id}/approve`,
      headers: reviewerAuth,
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      content: { id, status: 'published', medicalReviewed: true },
      version: 2,
    });

    const publishedEvents = store.outboxLog.filter((e) => e.eventType === 'content.published');
    expect(publishedEvents).toHaveLength(2);
    expect(publishedEvents.map((e) => (e.payload as { language: string }).language).sort()).toEqual(
      ['am', 'en'],
    );
    expect(publishedEvents[0].payload).toMatchObject({ content_id: id, version: 2 });
    expect(JSON.stringify(publishedEvents)).not.toContain('Safe pregnancy nutrition');

    // Published content is now listable + retrievable.
    const list = await app.inject({ method: 'GET', url: '/v1/content', headers: fatherAuth });
    expect(list.statusCode).toBe(200);
    expect(list.json().content.map((c: { id: string }) => c.id)).toEqual([id]);

    const filtered = await app.inject({
      method: 'GET',
      url: '/v1/content?language=en&week=12&type=article',
      headers: fatherAuth,
    });
    expect(filtered.json().content.map((c: { id: string }) => c.id)).toEqual([id]);

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/content/${id}`,
      headers: fatherAuth,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id, status: 'published' });

    // Archive -> removed from retrieval, retirement event emitted.
    const archive = await app.inject({
      method: 'POST',
      url: `/v1/content/${id}/archive`,
      headers: staffAuth,
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().status).toBe('archived');

    const retired = store.outboxLog.filter((e) => e.eventType === 'content.retired');
    expect(retired).toHaveLength(1);
    expect(retired[0].payload).toMatchObject({ content_id: id, version: 2 });

    const afterArchive = await app.inject({
      method: 'GET',
      url: '/v1/content',
      headers: fatherAuth,
    });
    expect(afterArchive.json().content).toEqual([]);

    const archivedDetail = await app.inject({
      method: 'GET',
      url: `/v1/content/${id}`,
      headers: fatherAuth,
    });
    expect(archivedDetail.statusCode).toBe(404);
    expect(archivedDetail.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('gates every write endpoint on the staff role', async () => {
    await boot();

    // A father cannot create a draft.
    const create = await app.inject({
      method: 'POST',
      url: '/v1/content',
      headers: fatherAuth,
      payload: DRAFT,
    });
    expect(create.statusCode).toBe(403);
    expect(create.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(store.outboxLog).toHaveLength(0);
  });

  it('rejects a staff author approving their own content (SoD, FR-106)', async () => {
    await boot();
    const create = await app.inject({
      method: 'POST',
      url: '/v1/content',
      headers: staffAuth,
      payload: DRAFT,
    });
    const id = create.json().id as string;
    await app.inject({ method: 'POST', url: `/v1/content/${id}/submit`, headers: staffAuth });

    const selfApprove = await app.inject({
      method: 'POST',
      url: `/v1/content/${id}/approve`,
      headers: staffAuth,
    });
    expect(selfApprove.statusCode).toBe(403);
    expect(selfApprove.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('returns 422 for invalid create bodies and malformed ids', async () => {
    await boot();

    const badType = await app.inject({
      method: 'POST',
      url: '/v1/content',
      headers: staffAuth,
      payload: { content_type: 'crypto' },
    });
    expect(badType.statusCode).toBe(422);
    expect(badType.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const missingType = await app.inject({
      method: 'POST',
      url: '/v1/content',
      headers: staffAuth,
      payload: { title_en: 'x' },
    });
    expect(missingType.statusCode).toBe(422);

    const badId = await app.inject({
      method: 'POST',
      url: '/v1/content/not-a-uuid/submit',
      headers: staffAuth,
    });
    expect(badId.statusCode).toBe(422);

    const badWeek = await app.inject({
      method: 'GET',
      url: '/v1/content?week=99',
      headers: fatherAuth,
    });
    expect(badWeek.statusCode).toBe(422);
  });

  it('returns 404 for unknown content and unknown routes', async () => {
    await boot();

    const missing = await app.inject({
      method: 'GET',
      url: `/v1/content/${randomUUID()}`,
      headers: fatherAuth,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const route = await app.inject({
      method: 'GET',
      url: '/v1/content/extra/path',
      headers: fatherAuth,
    });
    expect(route.statusCode).toBe(404);
  });

  it('echoes the request id on error envelopes', async () => {
    await boot();
    const requestId = createRequestId();
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/content',
      headers: { ...staffAuth, 'x-request-id': requestId },
      payload: { content_type: 'crypto' },
    });
    expect(bad.json().error.request_id).toBe(requestId);
    expect(bad.headers['x-request-id']).toBe(requestId);
  });
});
