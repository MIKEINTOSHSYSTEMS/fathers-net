import type { FastifyInstance } from 'fastify';
import type { Logger } from '@fathersnet/logger';
import { ForbiddenError, NotFoundError } from '@fathersnet/errors';
import type { ReminderService } from '../engine/reminder-service';
import type { AuthenticatedUser } from '../middleware/auth';
import type { ReminderInstance } from '../types';

export interface InternalRouteDeps {
  reminderService: ReminderService;
  logger: Logger;
}

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const InstanceIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

const ScheduleInstanceBody = {
  type: 'object',
  required: ['templateCode', 'userId', 'dueAt'],
  additionalProperties: false,
  properties: {
    templateCode: { type: 'string', minLength: 1, maxLength: 100 },
    userId: { type: 'string', pattern: UUID_PATTERN },
    dueAt: { type: 'string', format: 'date-time' },
    priority: { type: 'string', enum: ['normal', 'critical'] },
  },
} as const;

const DispatchListQuery = {
  type: 'object',
  properties: {
    userId: { type: 'string', pattern: UUID_PATTERN },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

/** Ownership gate (02 §5): a non-staff caller may only act on their own
 *  `userId` (their token `sub`); `staff` is the Phase-2 RBAC boundary. */
function enforceOwnership(user: AuthenticatedUser | null, resourceOwnerId: string): void {
  if (!user) {
    throw new ForbiddenError('Caller identity is required');
  }
  if (user.role !== 'staff' && user.subjectId !== resourceOwnerId) {
    throw new ForbiddenError('Caller does not own this resource');
  }
}

/** Resolve the effective list target for a father caller (own sub) vs staff. */
function resolveListUserId(
  user: AuthenticatedUser | null,
  requested: string | undefined,
): string | undefined {
  if (!user) {
    throw new ForbiddenError('Caller identity is required');
  }
  if (user.role === 'staff') {
    return requested;
  }
  if (requested && requested !== user.subjectId) {
    throw new ForbiddenError("Caller may not list another user's dispatch log");
  }
  return user.subjectId;
}

function toInstanceResponse(instance: ReminderInstance): Record<string, unknown> {
  return {
    id: instance.id,
    templateId: instance.templateId,
    userId: instance.userId,
    dueAt: instance.dueAt,
    status: instance.status,
    priority: instance.priority,
    channel: instance.channel,
    dedupeKey: instance.dedupeKey,
    dispatchedAt: instance.dispatchedAt,
    acknowledgedAt: instance.acknowledgedAt,
    lastError: instance.lastError,
    createdAt: instance.createdAt,
  };
}

/**
 * WP-021 internal contract (service-internal, never exposed via the gateway
 * `/v1/`). Schedule an instance, read instance state, list the dispatch/ack
 * log. Ownership is enforced from the bearer token on every route.
 */
export async function internalRoutes(app: FastifyInstance, deps: InternalRouteDeps): Promise<void> {
  app.post('/instances', { schema: { body: ScheduleInstanceBody } }, async (request, reply) => {
    const body = request.body as {
      templateCode: string;
      userId: string;
      dueAt: string;
      priority?: 'normal' | 'critical';
    };
    enforceOwnership(request.user as AuthenticatedUser | null, body.userId);
    const instance = await deps.reminderService.scheduleInstance({
      templateCode: body.templateCode,
      userId: body.userId,
      dueAt: body.dueAt,
      priority: body.priority,
    });
    deps.logger.info('reminders.instance_scheduled', 'reminder instance scheduled', {
      instance_id: instance.id,
      user_id: instance.userId,
      template_code: body.templateCode,
      due_at: instance.dueAt,
      request_id: request.id,
    });
    reply.status(201);
    return toInstanceResponse(instance);
  });

  app.get('/instances/:id', { schema: { params: InstanceIdParams } }, async (request) => {
    const params = request.params as { id: string };
    const instance = await deps.reminderService.getInstance(params.id);
    if (!instance) {
      throw new NotFoundError(`Reminder instance '${params.id}' not found`);
    }
    enforceOwnership(request.user as AuthenticatedUser | null, instance.userId);
    return toInstanceResponse(instance);
  });

  app.get('/dispatches', { schema: { querystring: DispatchListQuery } }, async (request) => {
    const query = request.query as { userId?: string; limit?: number; offset?: number };
    const userId = resolveListUserId(request.user as AuthenticatedUser | null, query.userId);
    const dispatches = await deps.reminderService.listDispatches({
      userId,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
    return { dispatches };
  });
}
