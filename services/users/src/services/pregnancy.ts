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

/**
 * Pregnancy engine contract (WP-017 stub; WP-019 owns the full engine).
 *
 * WP-019 (milestone-2 §5.7) replaces this stub with full week/trimester
 * auto-computation, milestone derivation, countdown, and recompute-on-edit.
 * The interface is the contract the users service routes EDD/LMP captures
 * through (FR-006/FR-031); it is pure (no I/O) and injectable so tests are
 * hermetic. This stub computes a defensible week/trimester so the routing is
 * exercised end-to-end until WP-019 lands.
 */
export interface PregnancyEngine {
  compute(input: PregnancyEngineInput): PregnancyComputation;
}

const DAYS_TO_FULL_TERM = 280;
const MS_PER_DAY = 86_400_000;

/** Parse `YYYY-MM-DD` as UTC to avoid timezone drift in date math. */
function utcDays(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date ${date}`);
  }
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
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

function clampWeek(week: number): number {
  if (week < 1) {
    return 1;
  }
  if (week > 45) {
    return 45;
  }
  return week;
}

export function createPregnancyEngineStub(): PregnancyEngine {
  return {
    compute(input: PregnancyEngineInput): PregnancyComputation {
      const today = utcDays(input.now.slice(0, 10));
      let week: number;
      if (input.lmp) {
        // Weeks since the last menstrual period (FR-031).
        week = Math.floor((today - utcDays(input.lmp)) / 7) + 1;
      } else if (input.edd) {
        // Days pregnant inferred from EDD (280 days to full term).
        const daysToGo = utcDays(input.edd) - today;
        const daysPregnant = DAYS_TO_FULL_TERM - daysToGo;
        week = Math.floor(daysPregnant / 7);
      } else {
        throw new Error('Pregnancy computation requires at least one of edd/lmp');
      }
      const pregnancyWeek = clampWeek(week);
      return { pregnancyWeek, trimester: trimesterFor(pregnancyWeek) };
    },
  };
}
