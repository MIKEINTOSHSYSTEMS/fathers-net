import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@fathersnet/errors';
import type { EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';
import type { OtpService } from '../services/otp';
import type { TokenService } from '../services/tokens';
import { publishAuthEvent } from '../services/events';

export interface AuthRouteDeps {
  otpService: OtpService;
  tokenService: TokenService;
  eventBus: EventBus;
  logger: Logger;
}

const OtpRequestBody = {
  type: 'object',
  required: ['phone', 'channel', 'purpose'],
  additionalProperties: false,
  properties: {
    phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
    channel: { type: 'string', enum: ['sms', 'whatsapp'] },
    purpose: { type: 'string', enum: ['registration', 'login'] },
  },
} as const;

const OtpVerifyBody = {
  type: 'object',
  required: ['phone', 'otp_code'],
  additionalProperties: false,
  properties: {
    phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
    otp_code: { type: 'string', pattern: '^\\d{4,8}$' },
  },
} as const;

const LogoutBody = {
  type: 'object',
  required: ['refresh_token'],
  additionalProperties: false,
  properties: {
    refresh_token: { type: 'string', minLength: 1 },
  },
} as const;

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match && match[1] ? match[1] : null;
}

/**
 * SRS §12.2 auth routes (WP-016): OTP request/verify, refresh, logout. Bodies
 * carry only what the contract defines; responses never leak OTP codes or
 * token material, and handlers log no PII (FR-022).
 */
export async function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): Promise<void> {
  app.post('/otp/request', { schema: { body: OtpRequestBody } }, async (request) => {
    const body = request.body as {
      phone: string;
      channel: 'sms' | 'whatsapp';
      purpose: 'registration' | 'login';
    };
    const result = await deps.otpService.requestOtp({
      phone: body.phone,
      channel: body.channel,
      purpose: body.purpose,
      requestId: request.id,
    });
    return { status: 'sent', expires_in: result.expiresIn };
  });

  app.post('/otp/verify', { schema: { body: OtpVerifyBody } }, async (request) => {
    const body = request.body as { phone: string; otp_code: string };
    const identity = await deps.otpService.verifyOtp({
      phone: body.phone,
      otpCode: body.otp_code,
      requestId: request.id,
    });
    const tokens = await deps.tokenService.issueTokens(identity);
    await publishAuthEvent(
      deps.eventBus,
      deps.logger,
      'auth.session.created',
      { user_id: identity.subjectId, method: 'otp', version: identity.tokenVersion },
      request.id,
    );
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
    };
  });

  app.post('/refresh', async (request) => {
    const token = extractBearer(request);
    if (!token) {
      throw new UnauthorizedError('Missing refresh token');
    }
    const result = await deps.tokenService.refreshAccessToken(token);
    if (!result) {
      throw new UnauthorizedError('Invalid or revoked refresh token');
    }
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
    };
  });

  app.post('/logout', { schema: { body: LogoutBody } }, async (request) => {
    const body = request.body as { refresh_token: string };
    const revoked = await deps.tokenService.revokeRefreshToken(body.refresh_token);
    if (!revoked) {
      throw new UnauthorizedError('Invalid or revoked refresh token');
    }
    await publishAuthEvent(
      deps.eventBus,
      deps.logger,
      'auth.session.revoked',
      { user_id: revoked.subjectId, reason: 'logout' },
      request.id,
    );
    return { status: 'revoked' };
  });
}
