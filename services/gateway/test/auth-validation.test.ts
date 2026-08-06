import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { createTestLogger } from '@fathersnet/test-utils';
import { buildApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

function testConfig(overrides: Record<string, string> = {}) {
  return loadGatewayConfig({
    ...process.env,
    ENV: 'dev',
    FN_PORT: '3000',
    FN_SERVICE_NAME: 'gateway',
    FN_VERSION: 'test',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

function signAccessToken(payload: Partial<jwt.JwtPayload> = {}): string {
  return jwt.sign(
    {
      role: 'father',
      token_version: 1,
      typ: 'access',
      sid: 'family-1',
      ...payload,
    },
    SECRET,
    {
      algorithm: 'HS256',
      issuer: 'fathersnet',
      audience: 'fathersnet-api',
      subject: '6f8b1f21-7a0c-4b6a-9f2c-2d4e5f6a7b8c',
      expiresIn: 900,
      jwtid: 'jti-1',
    },
  );
}

describe('gateway access-token validation (WP-016)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { logger } = createTestLogger('info');
    app = await buildApp({
      config: testConfig({ FN_AUTH_JWT_SECRET: SECRET }),
      logger,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('resolves the identity from a valid access token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: `Bearer ${signAccessToken()}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      authenticated: true,
      subject_id: '6f8b1f21-7a0c-4b6a-9f2c-2d4e5f6a7b8c',
    });
  });

  it('treats a wrong-signature token as unauthenticated (fail closed)', async () => {
    const forged = jwt.sign(
      { role: 'father', token_version: 1, typ: 'access' },
      'attacker-secret',
      {
        algorithm: 'HS256',
        issuer: 'fathersnet',
        audience: 'fathersnet-api',
        subject: '6f8b1f21-7a0c-4b6a-9f2c-2d4e5f6a7b8c',
        expiresIn: 900,
      },
    );
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: false, subject_id: null });
  });

  it('treats an expired token as unauthenticated', async () => {
    const expired = jwt.sign({ role: 'father', token_version: 1, typ: 'access' }, SECRET, {
      algorithm: 'HS256',
      issuer: 'fathersnet',
      audience: 'fathersnet-api',
      subject: '6f8b1f21-7a0c-4b6a-9f2c-2d4e5f6a7b8c',
      expiresIn: -10,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: false, subject_id: null });
  });

  it('treats a token with a non-access typ as unauthenticated', async () => {
    const wrongTyp = jwt.sign({ role: 'father', token_version: 1, typ: 'refresh' }, SECRET, {
      algorithm: 'HS256',
      issuer: 'fathersnet',
      audience: 'fathersnet-api',
      subject: '6f8b1f21-7a0c-4b6a-9f2c-2d4e5f6a7b8c',
      expiresIn: 900,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: `Bearer ${wrongTyp}` },
    });
    expect(response.json().authenticated).toBe(false);
  });

  it('treats a missing or malformed header as unauthenticated', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/v1/ping' });
    expect(anonymous.json()).toMatchObject({ authenticated: false, subject_id: null });

    const malformed = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(malformed.json().authenticated).toBe(false);
  });
});

describe('gateway pass-through mode (no FN_AUTH_JWT_SECRET)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { logger } = createTestLogger('info');
    app = await buildApp({
      config: testConfig({ FN_AUTH_JWT_SECRET: '' }),
      logger,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('records bearer presence without a subject id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: true, subject_id: null });
  });
});
