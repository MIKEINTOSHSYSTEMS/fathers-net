import { backoffMs } from '../src/scheduler/backoff';

describe('scheduler backoff (03 §5.4)', () => {
  it('grows exponentially from the base', () => {
    expect(backoffMs(1, 100, 10_000, 0)).toBe(100);
    expect(backoffMs(2, 100, 10_000, 0)).toBe(200);
    expect(backoffMs(3, 100, 10_000, 0)).toBe(400);
    expect(backoffMs(4, 100, 10_000, 0)).toBe(800);
  });

  it('caps at the max ceiling', () => {
    expect(backoffMs(10, 100, 5_000, 0)).toBe(5_000);
    expect(backoffMs(20, 100, 5_000, 0)).toBe(5_000);
  });

  it('applies jitter within ± jitterFactor of the capped value', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = backoffMs(4, 100, 5_000, 0.2);
      expect(value).toBeGreaterThanOrEqual(Math.floor(800 * 0.8));
      expect(value).toBeLessThanOrEqual(Math.ceil(800 * 1.2));
    }
  });
});
