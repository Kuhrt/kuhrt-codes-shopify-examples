import type { Page } from '@playwright/test';

import { NOW_MS } from './campaign';

/** Freezes the page clock at the fixed starting time; time then moves only through `advance`. Call before navigating. */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: NOW_MS - 1 });
  await page.clock.pauseAt(NOW_MS);
}

/** Moves the page clock forward by `ms`, firing every timer that falls due. */
export async function advance(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

/** Lets time run again, for tools such as axe that rely on timers firing. */
export async function resumeClock(page: Page): Promise<void> {
  await page.clock.resume();
}
