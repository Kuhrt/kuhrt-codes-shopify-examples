const THROTTLE_SIGNS = /throttl|too many requests|too many attempts|429/i;
const TOKEN_EXCHANGE_FAILURE = /admin\/oauth\/access_token/i;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether a failed request was rejected for exceeding the store's rate limit. */
export function isThrottled(error: unknown): boolean {
  return THROTTLE_SIGNS.test(messageOf(error));
}

/** Whether the CLI failed to get the app's token, before any operation was sent. */
export function isTokenExchangeFailure(error: unknown): boolean {
  return TOKEN_EXCHANGE_FAILURE.test(messageOf(error));
}

/**
 * Whether a failed order create is known to have created nothing, so retrying it can't
 * duplicate a day. `orderCreate` does not deduplicate on an idempotency key.
 */
export function isSafeToRetry(error: unknown): boolean {
  return isThrottled(error) || isTokenExchangeFailure(error);
}
