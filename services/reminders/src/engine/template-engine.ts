import { ValidationError } from '@fathersnet/errors';
import type { ReminderTemplate } from '../types';

/** Template variable values. Values are escaped before substitution — no
 *  evaluation of user input ever happens (R7). */
export type TemplateVariables = Record<string, string | number>;

export interface RenderedReminder {
  title: string;
  body: string;
  language: 'en' | 'am';
}

/** Token syntax: `{{variable_name}}`. */
const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escape text placed into a rendered message (R7 — templates are internal,
 *  but values may still contain characters that break message layout). */
export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

/** Extract the variable names referenced by a template body/title. */
export function extractVariableNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}

function renderText(
  text: string,
  variables: TemplateVariables,
  missing: { field: string; reason: string }[],
): string {
  return text.replace(TOKEN_PATTERN, (_whole, name: string) => {
    // eslint-disable-next-line security/detect-object-injection -- `name` is the TOKEN_PATTERN capture ([a-zA-Z0-9_]+), a compile-time constrained identifier, never untrusted input.
    const value = variables[name];
    if (value === undefined) {
      missing.push({ field: `variables.${name}`, reason: `Missing template variable '${name}'` });
      return '';
    }
    return escapeText(String(value));
  });
}

/**
 * Render a template in one language (FR-047). Templates are internal reference
 * data rendered with explicit variables; a missing variable fails closed
 * (ValidationError) so a broken reminder is never sent half-rendered.
 */
export function renderReminder(
  template: Pick<ReminderTemplate, 'titleEn' | 'titleAm' | 'bodyEn' | 'bodyAm'>,
  language: 'en' | 'am',
  variables: TemplateVariables = {},
): RenderedReminder {
  const title = language === 'en' ? template.titleEn : template.titleAm;
  const body = language === 'en' ? template.bodyEn : template.bodyAm;
  const missing: { field: string; reason: string }[] = [];
  const renderedTitle = renderText(title, variables, missing);
  const renderedBody = renderText(body, variables, missing);
  if (missing.length > 0) {
    throw new ValidationError('Template is missing required variables', missing);
  }
  return { title: renderedTitle, body: renderedBody, language };
}
