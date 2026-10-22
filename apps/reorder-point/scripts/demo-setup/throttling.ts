import { CliFailure, StepError } from '@repo/store-execute';

const THROTTLE_USER_ERROR = /too many attempts|too many requests|throttl/i;
const THROTTLED_CODE = 'THROTTLED';
const THROTTLED_MESSAGE = /^throttled$/i;
const QUOTED_THROTTLE = /"THROTTLED"|"Throttled"/;
const TOKEN_EXCHANGE_FAILURE = /request to \S+\/admin\/oauth\/access_token\s+failed/;

function isThrottledCliFailure(failure: CliFailure): boolean {
  return (
    failure.graphqlErrors.some(
      ({ code, message }) => code === THROTTLED_CODE || THROTTLED_MESSAGE.test(message)
    ) || QUOTED_THROTTLE.test(failure.output)
  );
}

/**
 * Whether a failed step was rejected for exceeding the store's rate limit: a user error such as
 * "Too many attempts", or a `THROTTLED` GraphQL error printed by the CLI.
 */
export function isThrottled(error: unknown): boolean {
  if (!(error instanceof StepError)) return false;
  if (error.cause === undefined) {
    return error.messages.some((message) => THROTTLE_USER_ERROR.test(message));
  }
  return error.cause instanceof CliFailure && isThrottledCliFailure(error.cause);
}

/** Whether the CLI failed to get the app's token, which it does before it sends anything. */
export function isTokenExchangeFailure(error: unknown): boolean {
  return error instanceof CliFailure && TOKEN_EXCHANGE_FAILURE.test(error.output);
}
