import { SchedulerError, type JobDefinition } from './types';

/**
 * Job registry (WP-024b). Jobs are registered at boot (WP-021 will register
 * its reminder/prompt job definitions here). The registry validates uniqueness
 * and shape so a misconfigured job fails fast instead of corrupting the run
 * schedule.
 */
export class JobRegistry {
  private readonly jobs = new Map<string, JobDefinition>();

  register(def: JobDefinition): void {
    if (!def.name || def.name.trim() === '') {
      throw new SchedulerError('Job name must be a non-empty string.');
    }
    if (this.jobs.has(def.name)) {
      throw new SchedulerError(`Job '${def.name}' is already registered.`);
    }
    if (!Number.isInteger(def.intervalSeconds) || def.intervalSeconds <= 0) {
      throw new SchedulerError(
        `Job '${def.name}' intervalSeconds must be a positive integer, got ${def.intervalSeconds}.`,
      );
    }
    if (typeof def.run !== 'function') {
      throw new SchedulerError(`Job '${def.name}' must define a run(ctx) handler.`);
    }
    this.jobs.set(def.name, def);
  }

  get(name: string): JobDefinition | undefined {
    return this.jobs.get(name);
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  list(): readonly JobDefinition[] {
    return [...this.jobs.values()];
  }

  get size(): number {
    return this.jobs.size;
  }
}
