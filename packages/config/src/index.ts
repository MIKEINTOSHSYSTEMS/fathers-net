/**
 * Central configuration registry (engineering-standards.md §18).
 *
 * - `ENV` is the single runtime-environment discriminator: dev | staging | prod.
 *   It is only ever read from the process environment at boot and never
 *   overridden at runtime (NFR-036).
 * - `FN_*` names are the canonical registry. Services read their own subset.
 * - Secrets are never defaulted or hard-coded here; they must be injected by
 *   the environment (FR-170, NFR-022). Missing required secrets fail fast.
 */

export type EnvName = 'dev' | 'staging' | 'prod';

export const VALID_ENV_NAMES: readonly EnvName[] = ['dev', 'staging', 'prod'];

export function parseEnvName(value: string | undefined): EnvName {
  if (!value) {
    return 'dev';
  }
  const normalized = value.toLowerCase();
  if ((VALID_ENV_NAMES as readonly string[]).includes(normalized)) {
    return normalized as EnvName;
  }
  throw new ConfigError(`Invalid ENV value '${value}'. Must be one of: dev, staging, prod.`);
}

export type FieldType = 'string' | 'number' | 'boolean' | 'enum' | 'string[]';

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  default?: string;
  description?: string;
  /** Allowed values when type === 'enum'. */
  enumValues?: readonly string[];
  /** For type === 'number'. */
  min?: number;
  max?: number;
}

export type ConfigSchema = Record<string, FieldSpec>;

export class ConfigError extends Error {
  readonly missing: string[];
  readonly invalid: string[];

  constructor(message: string, missing: string[] = [], invalid: string[] = []) {
    super(message);
    this.name = 'ConfigError';
    this.missing = missing;
    this.invalid = invalid;
  }
}

function parseValue(spec: FieldSpec, raw: string, field: string): unknown {
  switch (spec.type) {
    case 'string':
      return raw;
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw new ConfigError(`Config field '${field}' must be a number.`);
      }
      if (spec.min !== undefined && n < spec.min) {
        throw new ConfigError(`Config field '${field}' must be >= ${spec.min}.`);
      }
      if (spec.max !== undefined && n > spec.max) {
        throw new ConfigError(`Config field '${field}' must be <= ${spec.max}.`);
      }
      return n;
    }
    case 'boolean': {
      const normalized = raw.toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
      }
      throw new ConfigError(`Config field '${field}' must be a boolean.`);
    }
    case 'enum': {
      if (!spec.enumValues || !spec.enumValues.includes(raw)) {
        throw new ConfigError(
          `Config field '${field}' must be one of: ${spec.enumValues?.join(', ')}.`,
        );
      }
      return raw;
    }
    case 'string[]': {
      if (raw.trim() === '') {
        return [];
      }
      return raw.split(',').map((part) => part.trim());
    }
  }
}

export interface ConfigOptions {
  /** Where to read variables from. Defaults to process.env (12-factor). */
  source?: NodeJS.ProcessEnv;
}

/**
 * Load and validate the given schema from the environment.
 * Throws ConfigError listing every missing/invalid field — never a partial
 * config. Required fields with no default must be present.
 */
export function loadConfig(
  schema: ConfigSchema,
  options: ConfigOptions = {},
): Record<string, unknown> {
  const source = options.source ?? process.env;
  const missing: string[] = [];
  const invalid: string[] = [];
  const result: Record<string, unknown> = {};
  let parseError: ConfigError | null = null;

  for (const [field, spec] of Object.entries(schema)) {
    // eslint-disable-next-line security/detect-object-injection -- `field` is a key of the caller-provided closed schema, not user input.
    const raw = source[field];
    if (raw === undefined || raw === '') {
      if (spec.default !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- `field` is a key of the closed schema.
        result[field] = parseValue(spec, spec.default, field);
        continue;
      }
      if (spec.required) {
        missing.push(field);
      } else {
        // eslint-disable-next-line security/detect-object-injection -- `field` is a key of the closed schema.
        result[field] = spec.type === 'string[]' ? [] : undefined;
      }
      continue;
    }
    try {
      // eslint-disable-next-line security/detect-object-injection -- `field` is a key of the closed schema.
      result[field] = parseValue(spec, raw, field);
    } catch (err) {
      if (err instanceof ConfigError) {
        invalid.push(err.message);
        parseError ??= err;
      } else {
        throw err;
      }
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    const detail =
      (missing.length > 0 ? `Missing required fields: ${missing.join(', ')}. ` : '') +
      (invalid.length > 0 ? `Invalid fields: ${invalid.join(' | ')}.` : '');
    throw new ConfigError(detail.trim(), missing, invalid);
  }

  return result;
}

/** Env name registry field — present in every service's schema. */
export const ENV_FIELD: FieldSpec = {
  type: 'enum',
  enumValues: VALID_ENV_NAMES,
  default: 'dev',
  description: 'Runtime environment discriminator (dev | staging | prod).',
};
