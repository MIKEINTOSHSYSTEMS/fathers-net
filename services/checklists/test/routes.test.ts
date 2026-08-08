import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { createTestLogger } from '@fathersnet/test-utils';
import { buildChecklistApp } from '../src/app';
import { loadChecklistsConfig } from '../src/config';
import {
  createMemoryChecklistBudgetStore,
  type MemoryChecklistBudgetStore,
} from '../src/store/memory-store';

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    FN_PORT: '3600',
    FN_SERVICE_NAME: 'checklists',
    FN_CHECKLISTS_JWT_SECRET: SECRET,
    FN_BUDGET_CAP: '20000',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('checklists & budget API (SRS §12.6, §12.7, WP-023)', () => {
  let app: FastifyInstance;
  let store: MemoryChecklistBudgetStore;

  async function boot(overrides: Record<string, string> = {}): Promise<void> {
    const config = loadChecklistsConfig(buildEnv(overrides));
    store = createMemoryChecklistBudgetStore();
    const { logger } = createTestLogger('info');
    app = await buildChecklistApp({ config, store, logger });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  const ownerAuth = { authorization: `Bearer ${signAccessToken(OWNER)}` };
  const strangerAuth = { authorization: `Bearer ${signAccessToken(STRANGER)}` };

  it('serves liveness and readiness probes without auth', async () => {
    await boot();
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', service: 'checklists' });

    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok', driver: 'memory' });
  });

  it('requires a bearer token and rejects bad tokens', async () => {
    await boot();
    const noAuth = await app.inject({ method: 'GET', url: '/v1/checklists' });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    const badToken = await app.inject({
      method: 'GET',
      url: '/v1/checklists',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(badToken.statusCode).toBe(401);
  });

  it('lists the two lazily-created default checklists with empty items', async () => {
    await boot();
    const list = await app.inject({ method: 'GET', url: '/v1/checklists', headers: ownerAuth });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<Record<string, unknown>> };
    expect(body.items).toHaveLength(2);
    const byType = new Map(
      body.items.map((c) => [c.checklistType as string, c as { title: string }]),
    );
    expect(byType.get('hospital_bag')?.title).toBe('Hospital Bag');
    expect(byType.get('birth_prep')?.title).toBe('Birth Preparation');
    expect(body.items.every((c) => c.progress === 0)).toBe(true);
  });

  it('adds an item (201, custom) and reflects progress after completion', async () => {
    await boot();
    const list = await app.inject({ method: 'GET', url: '/v1/checklists', headers: ownerAuth });
    const checklist = (list.json().items as Array<{ id: string }>)[0];

    const created = await app.inject({
      method: 'POST',
      url: `/v1/checklists/${checklist.id}/items`,
      headers: ownerAuth,
      payload: { item_name: 'Passport', category: 'Documents' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      itemName: 'Passport',
      category: 'Documents',
      custom: true,
      completed: false,
    });

    const itemId = created.json().id as string;
    const toggled = await app.inject({
      method: 'PATCH',
      url: `/v1/checklists/${checklist.id}/items/${itemId}`,
      headers: ownerAuth,
      payload: { completed: true },
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().completed).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/checklists/${checklist.id}`,
      headers: ownerAuth,
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().progress).toBe(100);
    expect(after.json().items[0].completedAt).toBeTruthy();
  });

  it('returns 404 (invisibility) for stranger access on all checklist routes', async () => {
    await boot();
    const list = await app.inject({ method: 'GET', url: '/v1/checklists', headers: ownerAuth });
    const checklist = (list.json().items as Array<{ id: string }>)[0];
    const item = await app.inject({
      method: 'POST',
      url: `/v1/checklists/${checklist.id}/items`,
      headers: ownerAuth,
      payload: { item_name: 'x', category: 'Extras' },
    });
    const itemId = item.json().id as string;

    const read = await app.inject({
      method: 'GET',
      url: `/v1/checklists/${checklist.id}`,
      headers: strangerAuth,
    });
    expect(read.statusCode).toBe(404);

    const add = await app.inject({
      method: 'POST',
      url: `/v1/checklists/${checklist.id}/items`,
      headers: strangerAuth,
      payload: { item_name: 'hijack', category: 'Baby' },
    });
    expect(add.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/checklists/${checklist.id}/items/${itemId}`,
      headers: strangerAuth,
      payload: { completed: true },
    });
    expect(patch.statusCode).toBe(404);
  });

  it('validates checklist item bodies with 422', async () => {
    await boot();
    const list = await app.inject({ method: 'GET', url: '/v1/checklists', headers: ownerAuth });
    const checklist = (list.json().items as Array<{ id: string }>)[0];

    const noName = await app.inject({
      method: 'POST',
      url: `/v1/checklists/${checklist.id}/items`,
      headers: ownerAuth,
      payload: { category: 'Baby' },
    });
    expect(noName.statusCode).toBe(422);

    const badCategory = await app.inject({
      method: 'POST',
      url: `/v1/checklists/${checklist.id}/items`,
      headers: ownerAuth,
      payload: { item_name: 'x', category: 'Bogus' },
    });
    expect(badCategory.statusCode).toBe(422);

    const badId = await app.inject({
      method: 'PATCH',
      url: `/v1/checklists/not-a-uuid/items/not-a-uuid`,
      headers: ownerAuth,
      payload: { completed: true },
    });
    expect(badId.statusCode).toBe(422);
  });

  it('creates, lists with totals, patches, deletes and summarizes budget entries', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: {
        category: 'Transport',
        item_name: '  Taxi to hospital  ',
        planned_amount: 1500,
        entry_date: '2026-08-01',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      itemName: 'Taxi to hospital',
      plannedAmount: 1500,
      receiptImage: null,
    });

    const created2 = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: { category: 'Food', item_name: 'Snacks', planned_amount: 250.5, actual_amount: 100 },
    });
    const id2 = created2.json().id as string;

    const list = await app.inject({
      method: 'GET',
      url: '/v1/budget/entries',
      headers: ownerAuth,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);
    expect(list.json().totals).toEqual({ totalPlanned: 1750.5, totalActual: 100 });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/budget/entries/${id2}`,
      headers: ownerAuth,
      payload: { actual_amount: 120, notes: 'over budget' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      actualAmount: 120,
      notes: 'over budget',
      plannedAmount: 250.5,
    });

    const summary = await app.inject({
      method: 'GET',
      url: '/v1/budget/summary',
      headers: ownerAuth,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      cap: 20000,
      totalPlanned: 1750.5,
      totalActual: 120,
      variance: -1630.5,
      remaining: 18249.5,
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/budget/entries/${id2}`,
      headers: ownerAuth,
    });
    expect(deleted.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/budget/entries', headers: ownerAuth })).json()
        .items,
    ).toHaveLength(1);
  });

  it('gates budget reads/writes to the owner and validates bodies', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: { category: 'Food', item_name: 'Snacks', planned_amount: 100 },
    });
    const id = created.json().id as string;

    const strangerList = await app.inject({
      method: 'GET',
      url: '/v1/budget/entries',
      headers: strangerAuth,
    });
    expect(strangerList.statusCode).toBe(200);
    expect(strangerList.json().items).toHaveLength(0);

    const strangerPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/budget/entries/${id}`,
      headers: strangerAuth,
      payload: { notes: 'hijack' },
    });
    expect(strangerPatch.statusCode).toBe(404);

    const strangerDelete = await app.inject({
      method: 'DELETE',
      url: `/v1/budget/entries/${id}`,
      headers: strangerAuth,
    });
    expect(strangerDelete.statusCode).toBe(404);

    const missingCategory = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: { item_name: 'x', planned_amount: 1 },
    });
    expect(missingCategory.statusCode).toBe(422);

    const negative = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: { category: 'Food', item_name: 'x', planned_amount: -5 },
    });
    expect(negative.statusCode).toBe(422);

    const emptyPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/budget/entries/${id}`,
      headers: ownerAuth,
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(422);

    const badDate = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: { category: 'Food', item_name: 'x', planned_amount: 1, entry_date: '2026/08/01' },
    });
    expect(badDate.statusCode).toBe(422);
  });

  it('reports remaining null when no budget cap is configured', async () => {
    await boot({ FN_BUDGET_CAP: '0' });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: ownerAuth,
      payload: { category: 'Food', item_name: 'Snacks', planned_amount: 100 },
    });
    expect(created.statusCode).toBe(201);
    const summary = await app.inject({
      method: 'GET',
      url: '/v1/budget/summary',
      headers: ownerAuth,
    });
    expect(summary.json()).toMatchObject({ cap: null, totalPlanned: 100, remaining: null });
  });

  it('returns 404 for unknown routes and echoes the request id', async () => {
    await boot();
    const unknown = await app.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: ownerAuth,
    });
    expect(unknown.statusCode).toBe(404);

    const requestId = randomUUID();
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/budget/entries',
      headers: { ...ownerAuth, 'x-request-id': requestId },
      payload: {},
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.request_id).toBe(requestId);
    expect(bad.headers['x-request-id']).toBe(requestId);
  });
});
