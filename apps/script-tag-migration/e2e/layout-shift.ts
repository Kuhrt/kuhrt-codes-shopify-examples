import type { Page } from '@playwright/test';

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
}

interface ShiftTracker {
  observer: PerformanceObserver;
  total: number;
}

type TrackedWindow = Window & { __layoutShift?: ShiftTracker };

/** Starts summing every layout shift from the start of each document. Call before navigating. */
export async function trackLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tracker: ShiftTracker = {
      total: 0,
      observer: new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tracker.total += (entry as LayoutShiftEntry).value;
      })
    };
    tracker.observer.observe({ type: 'layout-shift', buffered: true });
    (window as TrackedWindow).__layoutShift = tracker;
  });
}

/** The layout shift summed since the document started, including entries not yet delivered. */
export async function totalLayoutShift(page: Page): Promise<number> {
  return page.evaluate(() => {
    const tracker = (window as TrackedWindow).__layoutShift;
    if (!tracker) throw new Error('Layout shift tracking was not started');
    for (const entry of tracker.observer.takeRecords()) {
      tracker.total += (entry as LayoutShiftEntry).value;
    }
    return tracker.total;
  });
}
