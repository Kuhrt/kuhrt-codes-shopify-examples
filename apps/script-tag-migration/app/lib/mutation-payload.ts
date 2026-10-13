import type { Failure } from './result';

interface UserError {
  message: string;
  field?: string[] | null;
}

function isUserError(value: unknown): value is UserError {
  if (typeof value !== 'object' || value === null) return false;
  const { message, field } = value as Record<string, unknown>;
  const validField =
    field === undefined ||
    field === null ||
    (Array.isArray(field) && field.every((part) => typeof part === 'string'));
  return typeof message === 'string' && validField;
}

export type Payload = Record<string, unknown>;

export function malformedPayload(operation: string): Failure {
  return {
    ok: false,
    kind: 'graphql-error',
    message: `The ${operation} response had an unexpected shape`
  };
}

/** Returns `data[operation]` when it is an object, otherwise `undefined`. */
export function payloadOf(data: unknown, operation: string): Payload | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const payload = (data as Payload)[operation];
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Payload)
    : undefined;
}

/**
 * Maps the first entry of a mutation payload's `userErrors` to a `user-error` failure, keeping its
 * `field` when present. A `userErrors` value that is not an array, or whose first entry is not a
 * user error, is a malformed payload. Returns `undefined` when there are no user errors.
 */
export function userErrorFailure(
  payload: { userErrors?: unknown },
  operation: string
): Failure | undefined {
  const { userErrors } = payload;
  if (userErrors !== undefined && !Array.isArray(userErrors)) return malformedPayload(operation);
  const [userError]: unknown[] = userErrors ?? [];
  if (userError === undefined) return undefined;
  if (!isUserError(userError)) return malformedPayload(operation);
  return {
    ok: false,
    kind: 'user-error',
    message: userError.message,
    ...(userError.field ? { field: userError.field } : {})
  };
}
