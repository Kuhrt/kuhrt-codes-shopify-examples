import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { ENDED_ATTRIBUTE } from '../widget/settings';
import { barLocators, ROOT_SELECTOR } from './bar';
import {
  barConfig,
  barEndingAfter,
  barEndingWithMessage,
  countdownText,
  ENDED_MESSAGE,
  HOUR_MS,
  MESSAGE,
  MINUTE_MS,
  SECOND_MS
} from './campaign';
import { advance, freezeClock, resumeClock } from './clock';
import { totalLayoutShift, trackLayoutShift } from './layout-shift';
import { openPage, PAGE_KINDS } from './pages';
import { PAGE_LINK_ID } from './routes';

const DISMISS_KEYS = ['Enter', 'Space'];
const TICK_MS = 5 * SECOND_MS;
const MOTION_PREFERENCES = ['reduce', 'no-preference'] as const;

function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
}

for (const kind of PAGE_KINDS) {
  test.describe(`${kind} page`, () => {
    test.beforeEach(async ({ page }) => {
      await freezeClock(page);
    });

    test('the countdown shows the time left and ticks as time passes', async ({ page }) => {
      await openPage(page, kind, barEndingAfter(HOUR_MS));
      const { countdown } = barLocators(page);
      const initial = countdownText(HOUR_MS, 0);
      const afterSecond = countdownText(HOUR_MS, SECOND_MS);
      const afterTick = countdownText(HOUR_MS, TICK_MS);
      await expect(countdown).toHaveText(initial);

      await advance(page, SECOND_MS);
      await expect(countdown).toHaveText(afterSecond);
      expect(afterSecond).not.toBe(initial);

      await advance(page, TICK_MS - SECOND_MS);
      await expect(countdown).toHaveText(afterTick);
    });

    test('a bar that hides when it ends disappears at the end time', async ({ page }) => {
      await openPage(page, kind, barEndingAfter(MINUTE_MS));
      const { roots, bar } = barLocators(page);
      await expect(bar).toBeVisible();

      await advance(page, MINUTE_MS - SECOND_MS);
      await expect(bar).toBeVisible();
      await advance(page, SECOND_MS);

      await expect(roots).toHaveCount(0);
    });

    test('a bar with an ended message swaps it in at the end time', async ({ page }) => {
      await openPage(page, kind, barEndingWithMessage(MINUTE_MS));
      const { bar, message, countdown } = barLocators(page);
      await expect(bar).not.toHaveAttribute(ENDED_ATTRIBUTE);

      await advance(page, MINUTE_MS - SECOND_MS);
      await expect(bar).not.toHaveAttribute(ENDED_ATTRIBUTE);
      await advance(page, SECOND_MS);

      await expect(bar).toHaveAttribute(ENDED_ATTRIBUTE, '');
      await expect(message).toHaveText(ENDED_MESSAGE);
      await expect(countdown).toBeEmpty();
    });

    test('a page loaded after the end time has no bar when it hides', async ({ page }) => {
      await openPage(page, kind, barEndingAfter(-MINUTE_MS));

      await expect(barLocators(page).roots).toHaveCount(0);
    });

    test('a page loaded after the end time shows the ended message', async ({ page }) => {
      await openPage(page, kind, barEndingWithMessage(-MINUTE_MS));
      const { bar, message } = barLocators(page);

      await expect(bar).toHaveAttribute(ENDED_ATTRIBUTE, '');
      await expect(message).toHaveText(ENDED_MESSAGE);
    });

    test('a dismissed bar stays dismissed across reloads', async ({ page }) => {
      await openPage(page, kind, barConfig());
      const { dismiss, roots } = barLocators(page);

      await dismiss.click();
      await expect(roots).toHaveCount(0);
      await page.reload();

      await expect(roots).toHaveCount(0);
    });

    test('a bar that is not dismissible has no dismiss button', async ({ page }) => {
      await openPage(page, kind, barConfig({ dismissible: false }));
      const { bar, dismiss } = barLocators(page);

      await expect(bar).toBeVisible();
      await expect(dismiss).toHaveCount(0);
    });

    test('a new campaign appears after the previous one was dismissed', async ({ page }) => {
      await openPage(page, kind, barConfig());
      const { bar, dismiss, roots } = barLocators(page);
      await dismiss.click();
      await expect(roots).toHaveCount(0);

      await openPage(page, kind, barConfig({ message: `${MESSAGE} next` }));

      await expect(bar).toBeVisible();
    });

    test('blocked storage does not stop the bar from rendering or dismissing', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Storage is blocked', 'SecurityError');
          }
        });
      });
      const errors = collectPageErrors(page);
      await openPage(page, kind, barConfig());
      const { bar, dismiss, roots } = barLocators(page);
      await expect(bar).toBeVisible();

      await dismiss.click();
      await expect(roots).toHaveCount(0);
      await page.reload();

      await expect(bar).toBeVisible();
      expect(errors).toEqual([]);
    });

    for (const key of DISMISS_KEYS) {
      test(`${key} on the focused dismiss button dismisses the bar and keeps keyboard focus on the page`, async ({
        page
      }) => {
        await openPage(page, kind, barConfig());
        const { dismiss, roots } = barLocators(page);
        await expect(dismiss).toBeVisible();

        await dismiss.focus();
        await expect(dismiss).toBeFocused();
        await page.keyboard.press(key);
        await expect(roots).toHaveCount(0);
        await expect(page.locator('body:focus')).toHaveCount(1);
        await page.keyboard.press('Tab');

        await expect(page.locator(`#${PAGE_LINK_ID}`)).toBeFocused();
      });
    }

    for (const reducedMotion of MOTION_PREFERENCES) {
      test.describe(`with ${reducedMotion} motion`, () => {
        test.use({ reducedMotion });

        test('the bar and its ticking countdown cause no layout shift', async ({ page }) => {
          await trackLayoutShift(page);
          await openPage(page, kind, barEndingAfter(HOUR_MS));
          const { countdown } = barLocators(page);
          await expect(countdown).toHaveText(countdownText(HOUR_MS, 0));

          await advance(page, TICK_MS);
          await expect(countdown).toHaveText(countdownText(HOUR_MS, TICK_MS));
          await resumeClock(page);

          expect(await totalLayoutShift(page)).toBe(0);
        });
      });
    }

    test('the bar has no accessibility violations', async ({ page }) => {
      await openPage(page, kind, barEndingAfter(HOUR_MS, { linkUrl: '/sale' }));
      await expect(barLocators(page).bar).toBeVisible();

      await resumeClock(page);

      const results = await new AxeBuilder({ page }).include(ROOT_SELECTOR).analyze();

      expect(results.violations).toEqual([]);
    });
  });
}
