import type { Priority } from '../types';

/**
 * Critical reminders bypass the quiet-hours window (FR-046). Normal reminders
 * are deferred/skipped during the Addis night window.
 */
export function bypassesQuietHours(priority: Priority): boolean {
  return priority === 'critical';
}

/**
 * Resolve the effective priority of a scheduled instance: an explicit caller
 * override wins; otherwise the template's priority applies. Denormalized on the
 * instance at schedule time so template edits never affect in-flight instances.
 */
export function resolvePriority(templatePriority: Priority, override?: Priority | null): Priority {
  return override ?? templatePriority;
}
