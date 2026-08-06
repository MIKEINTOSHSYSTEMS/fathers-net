/**
 * Pregnancy engine (WP-019, SRS §13.3.3 / FR-031…FR-037, milestone-2 §5.7).
 *
 * Pure computation module — no I/O — so every branch is hermetic and
 * unit-testable (M-08). It owns week/trimester auto-computation from EDD or
 * LMP (FR-031), milestone derivation (FR-033), the EDD countdown (FR-037),
 * and the journey status evaluation (FR-034). The `compute` contract is the
 * WP-017 capture surface the users-service routes EDD/LMP through (FR-006);
 * `snapshot` is the full status view consumed by the internal query contract
 * and later by WhatsApp/AI personalization (06 §373).
 *
 * Week contract (preserved from the WP-017 stub so API behavior is stable):
 *   - LMP  -> `floor(daysSinceLmp / 7) + 1`  (week 1 on the LMP date)
 *   - EDD  -> `floor(daysPregnant / 7)`      (280-day inverse)
 * Both clamp to 1–45 (pregnancies CHECK constraint). Milestones are anchored
 * to the *effective* LMP (lmp, or edd − 280 days) and their reported week uses
 * the same week function as the active pregnancy week, so a milestone is
 * reached exactly when the current week crosses its week — for either input
 * type (see `milestoneWeek`).
 */

export interface PregnancyComputation {
  /** Clamped to 1–45 (pregnancies CHECK constraint, FR-031). */
  pregnancyWeek: number;
  trimester: 1 | 2 | 3;
}

export interface PregnancyEngineInput {
  edd: string | null;
  lmp: string | null;
  /** ISO 8601 reference date (injectable clock for deterministic tests). */
  now: string;
}

export type MilestoneType = 'first_anc_visit' | 'first_trimester_end' | 'viability' | 'birth';

/** Journey status evaluation (FR-034): overdue once the EDD has passed. */
export type PregnancyStatus = 'active' | 'overdue';

export interface PregnancyMilestone {
  type: MilestoneType;
  /** Week (1–45) at which the milestone is reached, in the same week
   *  semantics as the active pregnancy week. */
  week: number;
  /** ISO date (YYYY-MM-DD) the milestone is due (FR-037). */
  date: string;
  /** True when the milestone date is today or earlier. */
  reached: boolean;
}

export interface PregnancySnapshot {
  edd: string | null;
  lmp: string | null;
  pregnancyWeek: number;
  trimester: 1 | 2 | 3;
  /** Days until the effective EDD; negative when overdue (FR-037). */
  countdownDays: number;
  status: PregnancyStatus;
  milestones: PregnancyMilestone[];
}

export interface PregnancyEngine {
  compute(input: PregnancyEngineInput): PregnancyComputation;
  snapshot(input: PregnancyEngineInput): PregnancySnapshot;
}

export const DAYS_TO_FULL_TERM = 280;
const MS_PER_DAY = 86_400_000;

/** Milestone schedule in days from the effective LMP (FR-033 examples). The
 *  day offsets are schedule constants — first ANC by ~12 weeks, T1 end, the
 *  ~24-week viability boundary, and the EDD itself. WP-021 may later make
 *  these admin-configurable template data. */
const MILESTONE_DAYS: ReadonlyArray<{ type: MilestoneType; day: number }> = [
  { type: 'first_anc_visit', day: 84 },
  { type: 'first_trimester_end', day: 91 },
  { type: 'viability', day: 161 },
  { type: 'birth', day: DAYS_TO_FULL_TERM },
];

/** Parse `YYYY-MM-DD` as UTC to avoid timezone drift in date math. */
function utcDays(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date ${date}`);
  }
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function fromDays(days: number): string {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

function weekFromLmp(lmpDays: number, todayDays: number): number {
  return Math.floor((todayDays - lmpDays) / 7) + 1;
}

function weekFromEdd(eddDays: number, todayDays: number): number {
  return Math.floor((DAYS_TO_FULL_TERM - (eddDays - todayDays)) / 7);
}

function clampWeek(week: number): number {
  if (week < 1) {
    return 1;
  }
  if (week > 45) {
    return 45;
  }
  return week;
}

function trimesterFor(week: number): 1 | 2 | 3 {
  if (week <= 13) {
    return 1;
  }
  if (week <= 27) {
    return 2;
  }
  return 3;
}

function requireAnchor(input: PregnancyEngineInput): void {
  if (!input.edd && !input.lmp) {
    throw new Error('Pregnancy computation requires at least one of edd/lmp');
  }
}

/**
 * Build the full pregnancy engine. `compute` reproduces the WP-017 stub
 * contract exactly (existing capture tests stay green); `snapshot` adds the
 * countdown, milestones, and status evaluation.
 */
export function createPregnancyEngine(): PregnancyEngine {
  return {
    compute(input: PregnancyEngineInput): PregnancyComputation {
      const today = utcDays(input.now.slice(0, 10));
      let week: number;
      if (input.lmp) {
        week = weekFromLmp(utcDays(input.lmp), today);
      } else if (input.edd) {
        week = weekFromEdd(utcDays(input.edd), today);
      } else {
        requireAnchor(input);
        week = 1;
      }
      const pregnancyWeek = clampWeek(week);
      return { pregnancyWeek, trimester: trimesterFor(pregnancyWeek) };
    },

    snapshot(input: PregnancyEngineInput): PregnancySnapshot {
      requireAnchor(input);
      const today = utcDays(input.now.slice(0, 10));
      const lmpDays = input.lmp ? utcDays(input.lmp) : null;
      const eddDays = input.edd ? utcDays(input.edd) : null;
      // Effective anchors: the EDD drives the countdown, the LMP drives the
      // milestone dates. EDD-only pregnancies derive their LMP (280-day
      // back-dated) so both date families stay consistent.
      const effectiveEdd = eddDays ?? lmpDays! + DAYS_TO_FULL_TERM;
      const effectiveLmp = lmpDays ?? effectiveEdd - DAYS_TO_FULL_TERM;

      // Week/trimester use the same per-input formulas as `compute`; the
      // milestone week reuses the SAME active function so `week <= currentWeek`
      // is exactly equivalent to `date <= today` for either input type.
      const activeWeekAt = (dateDays: number): number =>
        input.lmp ? weekFromLmp(effectiveLmp, dateDays) : weekFromEdd(effectiveEdd, dateDays);
      const pregnancyWeek = clampWeek(activeWeekAt(today));
      const countdownDays = effectiveEdd - today;
      const status: PregnancyStatus = countdownDays > 0 ? 'active' : 'overdue';

      const milestones: PregnancyMilestone[] = MILESTONE_DAYS.map(({ type, day }) => {
        const dateDays = effectiveLmp + day;
        return {
          type,
          week: clampWeek(activeWeekAt(dateDays)),
          date: fromDays(dateDays),
          reached: dateDays <= today,
        };
      });

      return {
        edd: input.edd ?? fromDays(effectiveEdd),
        lmp: input.lmp,
        pregnancyWeek,
        trimester: trimesterFor(pregnancyWeek),
        countdownDays,
        status,
        milestones,
      };
    },
  };
}
