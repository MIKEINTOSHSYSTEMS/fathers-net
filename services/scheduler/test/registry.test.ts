import { JobRegistry } from '../src/jobs/registry';
import { runIdFor, runSlotStartMs, SchedulerError, type JobDefinition } from '../src/jobs/types';

const noopRun = async (): Promise<void> => {};

describe('scheduler job registry', () => {
  it('registers a valid job', () => {
    const registry = new JobRegistry();
    registry.register({ name: 'sync', intervalSeconds: 60, run: noopRun });
    expect(registry.size).toBe(1);
    expect(registry.has('sync')).toBe(true);
    expect(registry.get('sync')?.name).toBe('sync');
  });

  it('rejects an empty job name', () => {
    const registry = new JobRegistry();
    expect(() => registry.register({ name: '  ', intervalSeconds: 60, run: noopRun })).toThrow(
      SchedulerError,
    );
  });

  it('rejects a duplicate job name', () => {
    const registry = new JobRegistry();
    registry.register({ name: 'sync', intervalSeconds: 60, run: noopRun });
    expect(() => registry.register({ name: 'sync', intervalSeconds: 30, run: noopRun })).toThrow(
      SchedulerError,
    );
  });

  it('rejects a non-positive or non-integer interval', () => {
    const registry = new JobRegistry();
    expect(() => registry.register({ name: 'zero', intervalSeconds: 0, run: noopRun })).toThrow(
      SchedulerError,
    );
    expect(() => registry.register({ name: 'frac', intervalSeconds: 1.5, run: noopRun })).toThrow(
      SchedulerError,
    );
  });

  it('rejects a job without a run handler', () => {
    const registry = new JobRegistry();
    expect(() =>
      registry.register({
        name: 'nod',
        intervalSeconds: 60,
        run: undefined as unknown as JobDefinition['run'],
      }),
    ).toThrow(SchedulerError);
  });

  it('lists jobs in registration order', () => {
    const registry = new JobRegistry();
    registry.register({ name: 'a', intervalSeconds: 60, run: noopRun });
    registry.register({ name: 'b', intervalSeconds: 30, run: noopRun });
    expect(registry.list().map((job) => job.name)).toEqual(['a', 'b']);
  });
});

describe('scheduler run slot helpers', () => {
  it('slices wall-clock time into deterministic slots', () => {
    expect(runSlotStartMs(60_000, 60)).toBe(60_000);
    expect(runSlotStartMs(90_000, 60)).toBe(60_000);
    expect(runSlotStartMs(119_999, 60)).toBe(60_000);
    expect(runSlotStartMs(120_000, 60)).toBe(120_000);
  });

  it('builds a deterministic run id from job + slot', () => {
    expect(runIdFor('sync', 60_000)).toBe('sync:60000');
    expect(runIdFor('sync', 120_000)).toBe('sync:120000');
  });
});
