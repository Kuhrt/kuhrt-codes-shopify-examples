// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BarConfig } from './config';
import { formatCountdown } from './countdown';
import { campaignKey, createDismissalStore } from './dismissal';
import { enhance } from './enhance';
import { buildBar } from './render';
import {
  COUNTDOWN_ATTRIBUTE,
  DISMISS_ATTRIBUTE,
  ENDED_ATTRIBUTE,
  ENDED_BEHAVIOR,
  MESSAGE_ATTRIBUTE
} from './settings';
import { blockedStorage, DAY, HOUR, MINIMAL_CONFIG as BASE, MINUTE, SECOND } from './test-support';

const START = Date.UTC(2027, 0, 1);
function mount(config: BarConfig): HTMLElement {
  const root = buildBar(config);
  document.body.appendChild(root);
  return root;
}

function countdownText(root: HTMLElement): string | null | undefined {
  return root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)?.textContent;
}

function dismissButton(root: HTMLElement): HTMLElement {
  const button = root.querySelector<HTMLElement>(`[${DISMISS_ATTRIBUTE}]`);
  if (!button) throw new Error('no dismiss button');
  return button;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  document.body.removeAttribute('tabindex');
});

describe('countdown', () => {
  const config: BarConfig = { ...BASE, endsAtMs: START + DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND };

  it('renders the remaining time immediately', () => {
    const root = mount(config);
    enhance(root, config);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 1, hours: 2, minutes: 3, seconds: 4 })
    );
  });

  it('ticks once per second', () => {
    const root = mount(config);
    enhance(root, config);
    vi.advanceTimersByTime(SECOND);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 1, hours: 2, minutes: 3, seconds: 3 })
    );
    vi.advanceTimersByTime(SECOND);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 1, hours: 2, minutes: 3, seconds: 2 })
    );
  });

  it('does not update between ticks', () => {
    const root = mount(config);
    enhance(root, config);
    vi.advanceTimersByTime(SECOND - 1);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 1, hours: 2, minutes: 3, seconds: 4 })
    );
  });

  it('omits the days unit when under a day remains', () => {
    const under: BarConfig = { ...BASE, endsAtMs: START + 2 * HOUR };
    const root = mount(under);
    enhance(root, under);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 0, hours: 2, minutes: 0, seconds: 0 })
    );
    expect(countdownText(root)).not.toMatch(/\dd\b/);
  });

  it('shows no countdown and starts no timer when there is no end time', () => {
    const root = mount(BASE);
    enhance(root, BASE);
    expect(root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the datetime attribute while ticking', () => {
    const root = mount(config);
    const before = root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)?.getAttribute('datetime');
    enhance(root, config);
    vi.advanceTimersByTime(5 * SECOND);
    expect(root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)?.getAttribute('datetime')).toBe(before);
  });

  it('stops ticking when the returned stop function is called', () => {
    const root = mount(config);
    const stop = enhance(root, config);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('when the countdown ends', () => {
  const endsAtMs = START + 3 * SECOND;

  it('removes the bar and stops the timer for "hide"', () => {
    const config: BarConfig = { ...BASE, endsAtMs };
    const root = mount(config);
    enhance(root, config);
    vi.advanceTimersByTime(3 * SECOND);
    expect(root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is still counting one second before the end', () => {
    const config: BarConfig = { ...BASE, endsAtMs };
    const root = mount(config);
    enhance(root, config);
    vi.advanceTimersByTime(2 * SECOND);
    expect(root.isConnected).toBe(true);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 1 })
    );
  });

  it('moves focus to body when the bar hides while the dismiss button has focus', () => {
    const config: BarConfig = { ...BASE, dismissible: true, endsAtMs };
    const root = mount(config);
    enhance(root, config);
    dismissButton(root).focus();
    vi.advanceTimersByTime(3 * SECOND);
    expect(root.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('does not steal focus when the bar hides while focus is elsewhere', () => {
    const config: BarConfig = { ...BASE, endsAtMs };
    const root = mount(config);
    const input = document.createElement('input');
    document.body.appendChild(input);
    enhance(root, config);
    input.focus();
    vi.advanceTimersByTime(3 * SECOND);
    expect(document.activeElement).toBe(input);
  });

  it('swaps in the ended message with no countdown for "message"', () => {
    const config: BarConfig = {
      ...BASE,
      endsAtMs,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    };
    const root = mount(config);
    enhance(root, config);
    vi.advanceTimersByTime(3 * SECOND);
    expect(root.isConnected).toBe(true);
    expect(root.querySelector(`[${MESSAGE_ATTRIBUTE}]`)?.textContent).toBe('Over');
    expect(root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)).toBeNull();
    expect(root.hasAttribute(ENDED_ATTRIBUTE)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops the link when showing the ended message', () => {
    const config: BarConfig = {
      ...BASE,
      linkUrl: '/sale',
      endsAtMs,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    };
    const root = mount(config);
    enhance(root, config);
    vi.advanceTimersByTime(3 * SECOND);
    expect(root.querySelector('a')).toBeNull();
  });
});

describe('tick alignment', () => {
  it('ends on the end-time boundary when the start is not second-aligned', () => {
    const config: BarConfig = { ...BASE, endsAtMs: START + 3500 };
    const root = mount(config);
    enhance(root, config);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 4 })
    );
    vi.advanceTimersByTime(499);
    expect(root.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 3 })
    );
    vi.advanceTimersByTime(3000);
    expect(root.isConnected).toBe(false);
  });
});

describe('page loaded after the end time', () => {
  it.each([0, 1, DAY])(
    'removes the bar for "hide" when the end passed %d ms ago, without ever showing a countdown',
    (ago) => {
      const config: BarConfig = { ...BASE, endsAtMs: START - ago };
      const root = mount(config);
      enhance(root, config);
      expect(root.isConnected).toBe(false);
      expect(countdownText(root)).toBe('');
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('starts in the ended state for "message"', () => {
    const config: BarConfig = {
      ...BASE,
      endsAtMs: START - SECOND,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    };
    const root = mount(config);
    enhance(root, config);
    expect(root.querySelector(`[${MESSAGE_ATTRIBUTE}]`)?.textContent).toBe('Over');
    expect(root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('dismissal', () => {
  const config: BarConfig = { ...BASE, dismissible: true, endsAtMs: START + HOUR };

  it('removes the bar, stops the timer and moves focus to body on click', () => {
    const root = mount(config);
    enhance(root, config);
    dismissButton(root).focus();
    dismissButton(root).click();
    expect(root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.activeElement).toBe(document.body);
  });

  it('does not leave a permanent tabindex on body', () => {
    const root = mount(config);
    enhance(root, config);
    dismissButton(root).click();
    document.body.blur();
    expect(document.body.hasAttribute('tabindex')).toBe(false);
  });

  it('preserves a tabindex the page already set on body', () => {
    document.body.setAttribute('tabindex', '0');
    const root = mount(config);
    enhance(root, config);
    dismissButton(root).click();
    document.body.blur();
    expect(document.body.getAttribute('tabindex')).toBe('0');
  });

  it('keeps the bar dismissed on the next page load', () => {
    const first = mount(config);
    enhance(first, config);
    dismissButton(first).click();

    const second = mount(config);
    enhance(second, config);
    expect(second.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the bar again when the message changes', () => {
    const first = mount(config);
    enhance(first, config);
    dismissButton(first).click();

    const changed: BarConfig = { ...config, message: 'New sale' };
    const second = mount(changed);
    enhance(second, changed);
    expect(second.isConnected).toBe(true);
  });

  it('shows the bar again when the end time changes', () => {
    const first = mount(config);
    enhance(first, config);
    dismissButton(first).click();

    const changed: BarConfig = { ...config, endsAtMs: START + 2 * HOUR };
    const second = mount(changed);
    enhance(second, changed);
    expect(second.isConnected).toBe(true);
  });

  it('can be dismissed after the ended message is showing', () => {
    const ending: BarConfig = {
      ...config,
      endsAtMs: START + SECOND,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    };
    const root = mount(ending);
    enhance(root, ending);
    vi.advanceTimersByTime(SECOND);
    dismissButton(root).click();
    expect(root.isConnected).toBe(false);
  });

  it('works for the current page when storage throws', () => {
    const blocked = createDismissalStore(blockedStorage);
    const root = mount(config);
    expect(() => enhance(root, config, { store: blocked })).not.toThrow();
    expect(() => dismissButton(root).click()).not.toThrow();
    expect(root.isConnected).toBe(false);

    const again = mount(config);
    enhance(again, config, { store: blocked });
    expect(again.isConnected).toBe(false);
  });

  it('ignores earlier dismissals when dismissal is not enabled', () => {
    const plain: BarConfig = { ...BASE, dismissible: false };
    createDismissalStore().dismiss(campaignKey(plain));
    const root = mount(plain);
    enhance(root, plain);
    expect(root.isConnected).toBe(true);
  });

  it('does not react to clicks after being stopped', () => {
    const root = mount(config);
    const stop = enhance(root, config);
    stop();
    dismissButton(root).click();
    expect(root.isConnected).toBe(true);
  });
});

describe('markup that does not match the config', () => {
  it('does not throw when the countdown element is missing', () => {
    const config: BarConfig = { ...BASE, endsAtMs: START + 3 * SECOND };
    const root = mount(config);
    root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)?.remove();
    expect(() => {
      enhance(root, config);
      vi.advanceTimersByTime(3 * SECOND);
    }).not.toThrow();
  });

  it('does not throw when the ended message has no message element', () => {
    const config: BarConfig = {
      ...BASE,
      endsAtMs: START + SECOND,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    };
    const root = mount(config);
    root.querySelector(`[${MESSAGE_ATTRIBUTE}]`)?.remove();
    expect(() => {
      enhance(root, config);
      vi.advanceTimersByTime(SECOND);
    }).not.toThrow();
  });

  it('does not throw when a dismissible config has no dismiss button', () => {
    const config: BarConfig = { ...BASE, dismissible: true, endsAtMs: START + HOUR };
    const root = mount(config);
    dismissButton(root).remove();
    expect(() => {
      const stop = enhance(root, config);
      stop();
    }).not.toThrow();
  });
});

describe('injected clock', () => {
  it('uses the provided now() instead of the system clock', () => {
    const config: BarConfig = { ...BASE, endsAtMs: 10 * SECOND };
    const root = mount(config);
    enhance(root, config, { now: () => 4 * SECOND });
    expect(countdownText(root)).toBe(
      formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 6 })
    );
  });
});
