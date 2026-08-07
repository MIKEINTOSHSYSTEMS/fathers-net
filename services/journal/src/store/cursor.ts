/**
 * Opaque timeline cursor (06 §3.3). Encodes the last-seen position as
 * base64url of `{ userId, createdAt, id }` so pagination is stable under
 * concurrent writes (plan §8 R7): the next page continues strictly AFTER the
 * anchor `(created_at, id)` in descending order. The cursor is opaque to
 * clients — never exposed as raw timestamps/ids.
 */

const CURSOR_KEYS = ['userId', 'createdAt', 'id'] as const;

export interface CursorPosition {
  userId: string;
  createdAt: string;
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCursorPosition(value: unknown): value is CursorPosition {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.userId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.id === 'string'
  );
}

export function encodeCursor(position: CursorPosition): string {
  const json = JSON.stringify(position);
  return Buffer.from(json, 'utf8').toString('base64url');
}

/** Decode + validate a cursor. Returns null for malformed input so a bad
 *  cursor degrades to the first page instead of a 5xx. */
export function decodeCursor(raw: string | null | undefined): CursorPosition | null {
  if (!raw || raw.length === 0 || raw.length > 4096) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!isCursorPosition(decoded)) {
      return null;
    }
    if (!decoded.id || !decoded.userId || Number.isNaN(Date.parse(decoded.createdAt))) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export { CURSOR_KEYS };
