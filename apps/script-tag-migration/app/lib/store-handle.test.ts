import { expect, it } from 'vitest';

import { storeHandle } from './store-handle';

it('strips the myshopify.com suffix', () => {
  expect(storeHandle('kuhrt-codes.myshopify.com')).toBe('kuhrt-codes');
});

it('leaves a domain without the suffix unchanged', () => {
  expect(storeHandle('kuhrt-codes')).toBe('kuhrt-codes');
});
