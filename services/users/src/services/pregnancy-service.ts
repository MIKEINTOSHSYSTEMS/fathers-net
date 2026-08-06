import type { EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';
import { publishEvent } from './events';
import type { PregnancyEngine, PregnancySnapshot } from './pregnancy';
import type { PregnancyRecord, UsersStore } from './store/types';

export interface PregnancyServiceOptions {
  store: UsersStore;
  eventBus: EventBus;
  logger: Logger;
  engine: PregnancyEngine;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

/**
 * Pregnancy journey service (WP-019, SRS §13.3.3 / FR-031…FR-037).
 *
 * Owns recompute-on-edit (FR-006) and the lazy week-rollover read path that
 * keeps `pregnancies.pregnancy_week`/`trimester` current as time advances
 * (FR-031 "as time advances"; a dedicated rollover scheduler lands with
 * WP-024b). Recompute is idempotent: `pregnancy.week.changed` is emitted only
 * when the week actually changes, and `milestone.reached` only when the
 * milestone's week is crossed — so repeated reads emit nothing (milestone
 * events additionally carry a `(user, milestone)` idempotency key per the
 * canonical vocabulary). Events are published by `pregnancy-engine` and carry
 * no PII: `user_id, week, trimester, edd` and `user_id, milestone, week`.
 */
export class PregnancyService {
  private readonly nowMs: () => number;

  constructor(private readonly options: PregnancyServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
  }

  private nowIso(): string {
    return new Date(this.nowMs()).toISOString();
  }

  /**
   * Evaluate the current journey state for a user, rolling the stored
   * week/trimester forward when time has advanced (FR-031). Returns `null`
   * when the user has no pregnancy record. Serves the internal query contract
   * `GET /internal/pregnancy/:userId` (06 §373).
   */
  async getStatus(userId: string): Promise<PregnancySnapshot | null> {
    const stored = await this.options.store.getPregnancy(userId);
    if (!stored) {
      return null;
    }
    const snapshot = this.options.engine.snapshot({
      edd: stored.edd,
      lmp: stored.lmp,
      now: this.nowIso(),
    });
    if (
      snapshot.pregnancyWeek !== stored.pregnancyWeek ||
      snapshot.trimester !== stored.trimester
    ) {
      await this.options.store.upsertPregnancy(userId, {
        edd: stored.edd,
        lmp: stored.lmp,
        pregnancyWeek: snapshot.pregnancyWeek,
        trimester: snapshot.trimester,
      });
    }
    await this.emitPregnancyEvents(userId, stored, snapshot, undefined);
    return snapshot;
  }

  /**
   * Recompute after an EDD/LMP edit (FR-006): persist the new computed state
   * and emit week/milestone events. The caller (users-service) validates the
   * input and ensures the user exists before calling.
   */
  async refreshAfterEdit(
    userId: string,
    input: { edd: string | null; lmp: string | null },
    requestId?: string,
  ): Promise<PregnancySnapshot> {
    const previous = await this.options.store.getPregnancy(userId);
    const snapshot = this.options.engine.snapshot({
      edd: input.edd,
      lmp: input.lmp,
      now: this.nowIso(),
    });
    await this.options.store.upsertPregnancy(userId, {
      edd: input.edd,
      lmp: input.lmp,
      pregnancyWeek: snapshot.pregnancyWeek,
      trimester: snapshot.trimester,
    });
    await this.emitPregnancyEvents(userId, previous, snapshot, requestId);
    return snapshot;
  }

  private async emitPregnancyEvents(
    userId: string,
    previous: PregnancyRecord | null,
    snapshot: PregnancySnapshot,
    requestId: string | undefined,
  ): Promise<void> {
    const prevWeek = previous?.pregnancyWeek ?? null;

    if (prevWeek !== snapshot.pregnancyWeek) {
      await publishEvent({
        bus: this.options.eventBus,
        logger: this.options.logger,
        type: 'pregnancy.week.changed',
        payload: {
          user_id: userId,
          week: snapshot.pregnancyWeek,
          trimester: snapshot.trimester,
          edd: snapshot.edd,
        },
        requestId,
        aggregate: { type: 'pregnancy', id: userId },
        producer: 'pregnancy-engine',
        idempotencyKey: `${userId}:${snapshot.pregnancyWeek}`,
      });
    }

    for (const milestone of snapshot.milestones) {
      if (!milestone.reached) {
        continue;
      }
      if (prevWeek !== null && prevWeek >= milestone.week) {
        continue;
      }
      await publishEvent({
        bus: this.options.eventBus,
        logger: this.options.logger,
        type: 'milestone.reached',
        payload: {
          user_id: userId,
          milestone: milestone.type,
          week: milestone.week,
        },
        requestId,
        aggregate: { type: 'pregnancy', id: userId },
        producer: 'pregnancy-engine',
        idempotencyKey: `${userId}:${milestone.type}`,
      });
    }
  }
}
