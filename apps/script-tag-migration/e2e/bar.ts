import type { Locator, Page } from '@playwright/test';

import { COUNTDOWN_ATTRIBUTE, MESSAGE_ATTRIBUTE, ROOT_ATTRIBUTE } from '../widget/settings';

export const ROOT_SELECTOR = `[${ROOT_ATTRIBUTE}]`;

export interface BarLocators {
  /** Every bar root on the page, to count them. */
  roots: Locator;
  bar: Locator;
  message: Locator;
  countdown: Locator;
  dismiss: Locator;
}

export function barLocators(page: Page): BarLocators {
  const bar = page.getByRole('complementary');
  return {
    roots: page.locator(ROOT_SELECTOR),
    bar,
    message: bar.locator(`[${MESSAGE_ATTRIBUTE}]`),
    countdown: bar.locator(`[${COUNTDOWN_ATTRIBUTE}]`),
    dismiss: bar.getByRole('button')
  };
}
