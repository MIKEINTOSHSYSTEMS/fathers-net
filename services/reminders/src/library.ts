/**
 * Library entry for `@fathersnet/reminders` (WP-021). The service's `main`
 * entry (`dist/index.js`) is the HTTP boot script; this module is the
 * package's import surface for the scheduler host and tests. `package.json`
 * points `main`/`types` here.
 */
export {
  createRemindersJobs,
  type ReminderJobDefinition,
  type CreateRemindersJobsOptions,
} from './jobs/reminders-dispatch-job';
export {
  createReminderService,
  ReminderService,
  type ReminderServiceOptions,
  type ReminderServiceConfig,
  type ScheduleReminderInput,
  type DispatchCycleResult,
  type DispatchCycleOutcome,
} from './engine/reminder-service';
export { createReminderStore, type ReminderStore, type ReminderStoreOptions } from './store';
export type {
  ReminderTemplate,
  ReminderInstance,
  ReminderDispatch,
  CreateReminderTemplateInput,
  CreateReminderInstanceInput,
  QuietHoursConfig,
  RecurrenceRule,
  Channel,
  Priority,
  ReminderStatus,
  DispatchStatus,
} from './types';
export { loadRemindersConfig, type RemindersConfig } from './config';
export { createStubDispatcher, type ChannelDispatcher } from './services/dispatcher';
