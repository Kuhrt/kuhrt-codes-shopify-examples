const THROTTLE_SIGNS = /throttl|too many requests|429/i;

/** Whether a failed request was rejected for exceeding the store's rate limit. */
export function isThrottled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return THROTTLE_SIGNS.test(message);
}
