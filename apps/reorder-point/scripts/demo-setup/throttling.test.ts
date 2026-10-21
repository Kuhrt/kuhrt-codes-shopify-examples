import { describe, expect, it } from 'vitest';

import { isSafeToRetry, isThrottled, isTokenExchangeFailure } from './throttling.ts';

const TOKEN_EXCHANGE_MESSAGE =
  'Authenticating ...\nerror\nrequest to https://kuhrt-codes.myshopify.com/admin/oauth/access_token\nfailed, reason:';

describe('isThrottled', () => {
  it.each([
    'order-create:2026-09-01: Too many attempts. Please try again later.',
    'Throttled',
    'The request was throttled, retry later',
    'Too Many Requests',
    'HTTP 429',
    'THROTTLED'
  ])('recognises "%s"', (message) => {
    expect(isThrottled(new Error(message))).toBe(true);
  });

  it.each(['Not authenticated', 'input.title: is invalid', ''])('ignores "%s"', (message) => {
    expect(isThrottled(new Error(message))).toBe(false);
  });

  it('reads a thrown string too', () => {
    expect(isThrottled('429')).toBe(true);
  });
});

describe('isTokenExchangeFailure', () => {
  it('recognises the CLI failing to fetch the app token', () => {
    expect(isTokenExchangeFailure(new Error(TOKEN_EXCHANGE_MESSAGE))).toBe(true);
  });

  it('ignores a failure of the operation itself', () => {
    expect(
      isTokenExchangeFailure(
        new Error('request to https://x/admin/api/2026-10/graphql.json failed')
      )
    ).toBe(false);
  });
});

describe('isSafeToRetry', () => {
  it.each([
    ['throttling', 'Too many attempts. Please try again later.'],
    ['a token exchange failure', TOKEN_EXCHANGE_MESSAGE]
  ])('retries %s', (_, message) => {
    expect(isSafeToRetry(new Error(message))).toBe(true);
  });

  it.each(['Not authenticated', 'socket hang up', 'input.lineItems: is invalid'])(
    'does not retry "%s", which may have created the order',
    (message) => {
      expect(isSafeToRetry(new Error(message))).toBe(false);
    }
  );
});
