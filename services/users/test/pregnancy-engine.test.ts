import { createPregnancyEngine } from '../src/services/pregnancy';

describe('createPregnancyEngine (WP-019, SRS §13.3.3)', () => {
  const engine = createPregnancyEngine();
  const NOW = '2025-03-01T12:00:00Z';

  describe('compute — week contract preserved from WP-017', () => {
    it('counts LMP weeks from 1 on the LMP date (7 days per week)', () => {
      expect(engine.compute({ edd: null, lmp: '2025-03-01', now: NOW }).pregnancyWeek).toBe(1);
      expect(engine.compute({ edd: null, lmp: '2025-02-22', now: NOW }).pregnancyWeek).toBe(2);
      expect(engine.compute({ edd: null, lmp: '2025-01-18', now: NOW }).pregnancyWeek).toBe(7);
      expect(engine.compute({ edd: null, lmp: '2024-12-21', now: NOW }).pregnancyWeek).toBe(11);
    });

    it('derives EDD weeks from the 280-day inverse', () => {
      expect(engine.compute({ edd: '2026-01-01', lmp: null, now: NOW }).pregnancyWeek).toBe(1);
      expect(engine.compute({ edd: '2025-10-01', lmp: null, now: NOW }).pregnancyWeek).toBe(9);
      expect(engine.compute({ edd: '2025-03-01', lmp: null, now: NOW }).pregnancyWeek).toBe(40);
      expect(engine.compute({ edd: '2025-02-20', lmp: null, now: NOW }).pregnancyWeek).toBe(41);
    });

    it('clamps to the 1–45 CHECK range', () => {
      expect(engine.compute({ edd: '2025-01-01', lmp: null, now: NOW }).pregnancyWeek).toBe(45);
      expect(engine.compute({ edd: null, lmp: '2025-03-02', now: NOW }).pregnancyWeek).toBe(1);
    });

    it('maps trimesters at the 13/14 and 27/28 boundaries', () => {
      expect(engine.compute({ edd: null, lmp: '2024-12-07', now: NOW })).toMatchObject({
        pregnancyWeek: 13,
        trimester: 1,
      });
      expect(engine.compute({ edd: null, lmp: '2024-11-30', now: NOW })).toMatchObject({
        pregnancyWeek: 14,
        trimester: 2,
      });
      expect(engine.compute({ edd: null, lmp: '2024-08-30', now: NOW })).toMatchObject({
        pregnancyWeek: 27,
        trimester: 2,
      });
      expect(engine.compute({ edd: null, lmp: '2024-08-23', now: NOW })).toMatchObject({
        pregnancyWeek: 28,
        trimester: 3,
      });
    });

    it('handles leap-year dates in week math', () => {
      expect(
        engine.compute({ edd: null, lmp: '2024-02-29', now: '2024-05-09T00:00:00Z' }),
      ).toMatchObject({
        pregnancyWeek: 11,
      });
    });

    it('throws when neither EDD nor LMP is provided', () => {
      expect(() => engine.compute({ edd: null, lmp: null, now: NOW })).toThrow(
        /at least one of edd\/lmp/,
      );
      expect(() => engine.snapshot({ edd: null, lmp: null, now: NOW })).toThrow(
        /at least one of edd\/lmp/,
      );
    });
  });

  describe('snapshot — journey status (FR-031…FR-037)', () => {
    it('builds the full EDD-only journey view', () => {
      const snap = engine.snapshot({ edd: '2025-10-01', lmp: null, now: NOW });
      expect(snap).toMatchObject({
        edd: '2025-10-01',
        lmp: null,
        pregnancyWeek: 9,
        trimester: 1,
        countdownDays: 214,
        status: 'active',
      });
      expect(snap.milestones).toEqual([
        { type: 'first_anc_visit', week: 12, date: '2025-03-19', reached: false },
        { type: 'first_trimester_end', week: 13, date: '2025-03-26', reached: false },
        { type: 'viability', week: 23, date: '2025-06-04', reached: false },
        { type: 'birth', week: 40, date: '2025-10-01', reached: false },
      ]);
    });

    it('derives the EDD from LMP (+280 days) when only LMP is known', () => {
      const snap = engine.snapshot({ edd: null, lmp: '2024-12-25', now: NOW });
      expect(snap.edd).toBe('2025-10-01');
      expect(snap.lmp).toBe('2024-12-25');
      expect(snap.pregnancyWeek).toBe(10);
      expect(snap.countdownDays).toBe(214);
      expect(snap.milestones[3]).toEqual({
        type: 'birth',
        week: 41,
        date: '2025-10-01',
        reached: false,
      });
    });

    it('marks the journey overdue once the EDD passes (FR-034)', () => {
      const snap = engine.snapshot({ edd: '2025-01-15', lmp: null, now: NOW });
      expect(snap.status).toBe('overdue');
      expect(snap.countdownDays).toBeLessThan(0);
      expect(snap.pregnancyWeek).toBe(45);
      expect(snap.trimester).toBe(3);
      expect(snap.milestones.every((m) => m.reached)).toBe(true);
    });

    it('marks milestones reached when their date is today or earlier', () => {
      const snap = engine.snapshot({ edd: '2025-09-01', lmp: null, now: NOW });
      const reached = snap.milestones.filter((m) => m.reached);
      expect(reached.map((m) => m.type)).toEqual(['first_anc_visit', 'first_trimester_end']);
      expect(snap.pregnancyWeek).toBe(13);
    });
  });
});
