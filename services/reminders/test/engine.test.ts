import { ValidationError } from '@fathersnet/errors';
import { dayWindow, withinDailyCap } from '../src/engine/cap';
import { applyLeadTime, dispatchWindowOpen, isExpired } from '../src/engine/lead-time';
import { bypassesQuietHours, resolvePriority } from '../src/engine/priority';
import {
  isInQuietHours,
  parseQuietHours,
  parseTimeOfDay,
  quietHoursFor,
} from '../src/engine/quiet-hours';
import { expandOccurrences, isRecurring, parseRecurrence } from '../src/engine/recurrence';
import { escapeText, extractVariableNames, renderReminder } from '../src/engine/template-engine';
import type { ReminderTemplate } from '../src/types';

const TZ = 180; // UTC+3, Addis Ababa (no DST).

describe('template engine (FR-047, R7)', () => {
  const template: Pick<ReminderTemplate, 'titleEn' | 'titleAm' | 'bodyEn' | 'bodyAm'> = {
    titleEn: 'Reminder for {{name}}',
    titleAm: 'ማስታወሻ ለ{{name}}',
    bodyEn: 'Appointment on {{date}} at {{time}}.',
    bodyAm: 'ቀጠሮ በ{{date}} ላይ በ{{time}}።',
  };

  it('renders EN and AM from the same template', () => {
    const variables = { name: 'Dawit', date: 'Mon', time: '09:00' };
    expect(renderReminder(template, 'en', variables)).toEqual({
      title: 'Reminder for Dawit',
      body: 'Appointment on Mon at 09:00.',
      language: 'en',
    });
    expect(renderReminder(template, 'am', variables).language).toBe('am');
  });

  it('trims whitespace inside tokens', () => {
    expect(renderReminder(template, 'en', { name: 'A', date: 'D', time: 'T' }).title).toBe(
      'Reminder for A',
    );
  });

  it('escapes values before substitution (R7)', () => {
    const nasty = { name: '<b>&"q"</b>', date: 'D', time: 'T' };
    const rendered = renderReminder(template, 'en', nasty);
    expect(rendered.title).toBe('Reminder for &lt;b&gt;&amp;&quot;q&quot;&lt;/b&gt;');
  });

  it('extracts unique variable names from a template', () => {
    expect(extractVariableNames('{{a}} then {{ b }} and {{a}}')).toEqual(['a', 'b']);
  });

  it('fails closed on a missing variable (ValidationError with field reasons)', () => {
    try {
      renderReminder(template, 'en', { name: 'Dawit' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validation = err as ValidationError;
      expect(validation.fields).toEqual(
        expect.arrayContaining([
          { field: 'variables.date', reason: expect.stringContaining('date') },
          { field: 'variables.time', reason: expect.stringContaining('time') },
        ]),
      );
    }
  });

  it('escapes standalone text', () => {
    expect(escapeText(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });
});

describe('quiet hours (FR-029/FR-043)', () => {
  it('parses HH:MM into minutes since local midnight', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('21:00')).toBe(1260);
    expect(parseTimeOfDay('23:59')).toBe(1439);
    expect(() => parseTimeOfDay('25:00')).toThrow(RangeError);
    expect(() => parseTimeOfDay('7:00')).toThrow(RangeError);
  });

  it('parses a valid app-layer config and rejects malformed ones', () => {
    expect(parseQuietHours({ enabled: true, start: '21:00', end: '07:00' })).toEqual({
      enabled: true,
      start: '21:00',
      end: '07:00',
    });
    expect(parseQuietHours(null)).toBeNull();
    expect(parseQuietHours('nope')).toBeNull();
    expect(parseQuietHours({ start: '21:00' })).toBeNull();
    expect(parseQuietHours({ enabled: true, start: '25:00', end: '07:00' })).toBeNull();
  });

  it('defaults enabled to true when absent', () => {
    expect(parseQuietHours({ start: '21:00', end: '07:00' })?.enabled).toBe(true);
  });

  it('resolves precedence: user > template > defaults', () => {
    const defaults = { enabled: true, start: '21:00', end: '07:00' };
    const template = { enabled: true, start: '12:00', end: '13:00' };
    const user = { enabled: false, start: '21:00', end: '07:00' };
    expect(quietHoursFor(user, template, defaults)).toEqual(user);
    expect(quietHoursFor(null, template, defaults)).toEqual(template);
    expect(quietHoursFor(null, null, defaults)).toEqual(defaults);
  });

  it('is inside an overnight window from start to end-exclusive', () => {
    const config = { enabled: true, start: '21:00', end: '07:00' };
    expect(isInQuietHours('2025-01-01T18:00:00Z', config, TZ)).toBe(true); // 21:00 local
    expect(isInQuietHours('2025-01-01T00:30:00Z', config, TZ)).toBe(true); // 03:30 local
    expect(isInQuietHours('2025-01-01T04:00:00Z', config, TZ)).toBe(false); // 07:00 local = end, exclusive
    expect(isInQuietHours('2025-01-01T17:59:00Z', config, TZ)).toBe(false); // 20:59 local
  });

  it('handles a same-day window and its boundaries', () => {
    const config = { enabled: true, start: '09:00', end: '17:00' };
    expect(isInQuietHours('2025-01-01T10:00:00Z', config, TZ)).toBe(true); // 13:00 local
    expect(isInQuietHours('2025-01-01T06:00:00Z', config, TZ)).toBe(true); // 09:00 local = start, inclusive
    expect(isInQuietHours('2025-01-01T14:00:00Z', config, TZ)).toBe(false); // 17:00 local = end, exclusive
    expect(isInQuietHours('2025-01-01T15:00:00Z', config, TZ)).toBe(false); // 18:00 local, after the window
  });

  it('never blocks when disabled or when start equals end', () => {
    const disabled = { enabled: false, start: '21:00', end: '07:00' };
    const allDay = { enabled: true, start: '12:00', end: '12:00' };
    expect(isInQuietHours('2025-01-01T18:00:00Z', disabled, TZ)).toBe(false);
    expect(isInQuietHours('2025-01-01T10:00:00Z', allDay, TZ)).toBe(false);
  });
});

describe('daily cap (06 §4.14)', () => {
  it('blocks only once the cap count is reached', () => {
    expect(withinDailyCap(2, 3)).toBe(true);
    expect(withinDailyCap(3, 3)).toBe(false);
  });

  it('computes the Addis-day window bounds', () => {
    const nowMs = Date.parse('2025-01-01T10:00:00Z');
    const window = dayWindow(nowMs, TZ);
    expect(window.startIso).toBe('2024-12-31T21:00:00.000Z');
    expect(window.endIso).toBe('2025-01-01T21:00:00.000Z');
  });
});

describe('lead time (FR-043)', () => {
  it('subtracts the lead time from the event time', () => {
    expect(applyLeadTime('2025-01-05T09:00:00Z', 60)).toBe('2025-01-05T08:00:00.000Z');
    expect(applyLeadTime('2025-01-05T09:00:00Z', null)).toBe('2025-01-05T09:00:00Z');
    expect(applyLeadTime('2025-01-05T09:00:00Z', 0)).toBe('2025-01-05T09:00:00Z');
  });

  it('opens the dispatch window only once due time has passed', () => {
    expect(dispatchWindowOpen('2025-01-05T09:00:00Z', Date.parse('2025-01-05T10:00:00Z'))).toBe(
      true,
    );
    expect(dispatchWindowOpen('2025-01-05T09:00:00Z', Date.parse('2025-01-05T08:00:00Z'))).toBe(
      false,
    );
  });

  it('expires an instance that waited longer than the expiry window', () => {
    const nowMs = Date.parse('2025-01-05T10:00:00Z');
    expect(isExpired('2025-01-05T08:59:00Z', nowMs, 60)).toBe(true);
    expect(isExpired('2025-01-05T09:30:00Z', nowMs, 60)).toBe(false);
    expect(isExpired('2025-01-05T09:00:00Z', nowMs, 60)).toBe(false); // exactly 60m: not expired
  });
});

describe('priority (FR-046)', () => {
  it('critical bypasses quiet hours, normal does not', () => {
    expect(bypassesQuietHours('critical')).toBe(true);
    expect(bypassesQuietHours('normal')).toBe(false);
  });

  it('an explicit override wins over the template priority', () => {
    expect(resolvePriority('normal', 'critical')).toBe('critical');
    expect(resolvePriority('critical', null)).toBe('critical');
    expect(resolvePriority('normal', undefined)).toBe('normal');
  });
});

describe('recurrence (FR-044, FR-041)', () => {
  it('parses one-time and weekly rules, rejecting malformed ones', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence(undefined)).toBeNull();
    expect(parseRecurrence('nope')).toBeNull();
    expect(parseRecurrence({ type: 'one_time' })).toEqual({ type: 'one_time' });
    expect(parseRecurrence({ type: 'weekly', intervalWeeks: 2, endWeek: 40 })).toEqual({
      type: 'weekly',
      intervalWeeks: 2,
      endWeek: 40,
    });
    expect(parseRecurrence({ type: 'weekly', intervalWeeks: 0, endWeek: 40 })).toBeNull();
    expect(parseRecurrence({ type: 'weekly', intervalWeeks: 2, endWeek: 46 })).toBeNull();
    expect(parseRecurrence({ type: 'weekly', intervalWeeks: 1.5, endWeek: 40 })).toBeNull();
    expect(parseRecurrence({ type: 'daily' })).toBeNull();
  });

  it('only weekly rules are recurring', () => {
    expect(isRecurring(null)).toBe(false);
    expect(isRecurring({ type: 'one_time' })).toBe(false);
    expect(isRecurring({ type: 'weekly', intervalWeeks: 1, endWeek: 40 })).toBe(true);
  });

  it('expands a one-time rule to a single occurrence', () => {
    const dueAt = '2025-01-05T09:00:00Z';
    expect(expandOccurrences(null, 12, dueAt, 45)).toEqual([{ week: 12, dueAt }]);
    expect(expandOccurrences({ type: 'one_time' }, 12, dueAt, 45)).toEqual([{ week: 12, dueAt }]);
  });

  it('expands a weekly rule within the 1-45 pregnancy window', () => {
    const dueAt = '2025-01-05T09:00:00Z';
    const occurrences = expandOccurrences(
      { type: 'weekly', intervalWeeks: 2, endWeek: 20 },
      12,
      dueAt,
      45,
    );
    expect(occurrences.map((o) => o.week)).toEqual([12, 14, 16, 18, 20]);
    expect(occurrences[1].dueAt).toBe('2025-01-19T09:00:00.000Z');
  });

  it('caps the end week at the service max and clamps the start week', () => {
    const dueAt = '2025-01-05T09:00:00Z';
    const capped = expandOccurrences(
      { type: 'weekly', intervalWeeks: 1, endWeek: 50 },
      1,
      dueAt,
      45,
    );
    expect(capped.map((o) => o.week)).toEqual(expect.arrayContaining([44, 45]));
    expect(capped.some((o) => o.week === 46)).toBe(false);

    const clamped = expandOccurrences(
      { type: 'weekly', intervalWeeks: 1, endWeek: 45 },
      50,
      dueAt,
      45,
    );
    expect(clamped.map((o) => o.week)).toEqual([45]);
  });
});
