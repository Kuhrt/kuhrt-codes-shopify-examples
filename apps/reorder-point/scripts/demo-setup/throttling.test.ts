import { CliFailure, StepError } from '@repo/store-execute';
import { describe, expect, it } from 'vitest';

import { TOKEN_EXCHANGE_OUTPUT } from './fake-store.ts';
import { isThrottled, isTokenExchangeFailure } from './throttling.ts';

const COMMAND_LINE_FAILURE =
  'Command failed: node run.js app execute -s throttle429.myshopify.com --path /repo/tools/demo-seeder';

function stepFailedWith(cause: CliFailure): StepError {
  return new StepError('order-create:2026-09-01', [cause.message], { cause });
}

describe('isThrottled', () => {
  it.each([
    'Too many attempts. Please try again later.',
    'Throttled',
    'The request was throttled, retry later',
    'Too Many Requests'
  ])('recognises the user error "%s"', (message) => {
    expect(isThrottled(new StepError('order-create:2026-09-01', [message]))).toBe(true);
  });

  it('recognises a THROTTLED code in the GraphQL errors the CLI printed', () => {
    const cause = new CliFailure('Something', {
      graphqlErrors: [{ message: 'Something', code: 'THROTTLED' }]
    });
    expect(isThrottled(stepFailedWith(cause))).toBe(true);
  });

  it('recognises a "Throttled" GraphQL error message', () => {
    const cause = new CliFailure('Throttled', { graphqlErrors: [{ message: 'Throttled' }] });
    expect(isThrottled(stepFailedWith(cause))).toBe(true);
  });

  it('recognises a quoted THROTTLED code in the error box the CLI drew', () => {
    const cause = new CliFailure('GraphQL operation failed.', {
      output:
        'GraphQL operation failed.\n{ "errors": [ { "extensions": { "code": "THROTTLED" } } ] }'
    });
    expect(isThrottled(stepFailedWith(cause))).toBe(true);
  });

  it.each([
    ['a user error that is not about throttling', new StepError('s', ['input.title: is invalid'])],
    ['a step that is not about the rate limit', new StepError('s', [])],
    ['an error that is not a step failure', new Error('Too many attempts')],
    ['a thrown string', 'throttled']
  ])('ignores %s', (_name, error) => {
    expect(isThrottled(error)).toBe(false);
  });

  it.each(['shop429', 'throttle-shop', 'throttled'])(
    'ignores a CLI failure whose command line names the store %s',
    (handle) => {
      const cause = new CliFailure(COMMAND_LINE_FAILURE.replace('throttle429', handle), {
        cause: new Error('timed out')
      });
      expect(isThrottled(stepFailedWith(cause))).toBe(false);
    }
  );

  it('ignores the store name in the CLI output', () => {
    const cause = new CliFailure('failed', {
      output: 'request to https://throttled-429.myshopify.com/admin/api/graphql.json failed'
    });
    expect(isThrottled(stepFailedWith(cause))).toBe(false);
  });
});

describe('isTokenExchangeFailure', () => {
  it('recognises the CLI failing to fetch the app token', () => {
    expect(
      isTokenExchangeFailure(
        new CliFailure('Could not get a token', { output: TOKEN_EXCHANGE_OUTPUT })
      )
    ).toBe(true);
  });

  it('ignores a failure of the operation itself', () => {
    const output = 'request to https://x.myshopify.com/admin/api/2026-10/graphql.json failed';
    expect(isTokenExchangeFailure(new CliFailure('failed', { output }))).toBe(false);
  });

  it('ignores a command line that mentions the token endpoint', () => {
    const failure = new CliFailure(
      'Command failed: request to https://x.myshopify.com/admin/oauth/access_token failed'
    );
    expect(isTokenExchangeFailure(failure)).toBe(false);
  });

  it('ignores an error that is not a CLI failure', () => {
    expect(isTokenExchangeFailure(new Error(TOKEN_EXCHANGE_OUTPUT))).toBe(false);
  });
});
