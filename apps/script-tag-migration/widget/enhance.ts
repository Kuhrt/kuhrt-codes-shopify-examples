import type { BarConfig } from './config';
import { formatCountdown, MS_PER_SECOND, remaining } from './countdown';
import type { DismissalStore } from './dismissal';
import { campaignKey, createDismissalStore } from './dismissal';
import {
  COUNTDOWN_ATTRIBUTE,
  DISMISS_ATTRIBUTE,
  ENDED_ATTRIBUTE,
  ENDED_BEHAVIOR,
  MESSAGE_ATTRIBUTE
} from './settings';

export interface EnhanceDeps {
  now?: () => number;
  store?: DismissalStore;
}

function moveFocusToBody(doc: Document): void {
  const body = doc.body;
  if (!body) return;
  if (!body.hasAttribute('tabindex')) {
    body.setAttribute('tabindex', '-1');
    body.addEventListener('blur', () => body.removeAttribute('tabindex'), { once: true });
  }
  body.focus();
}

/** Removes the bar, keeping keyboard focus on the page if it was inside the bar. */
function removeBar(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const hadFocus = root.contains(doc.activeElement);
  root.remove();
  if (hadFocus) moveFocusToBody(doc);
}

function showEndedMessage(root: HTMLElement, message: string): void {
  const messageElement = root.querySelector(`[${MESSAGE_ATTRIBUTE}]`);
  if (messageElement) messageElement.textContent = message;
  root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)?.remove();
  root.setAttribute(ENDED_ATTRIBUTE, '');
}

function applyEnded(root: HTMLElement, config: BarConfig): void {
  if (config.ended.behavior === ENDED_BEHAVIOR.message) {
    showEndedMessage(root, config.ended.message);
  } else {
    removeBar(root);
  }
}

/** Milliseconds until the displayed second next changes, so ticks land on the end time's second boundary. */
function msUntilNextTick(endsAtMs: number, nowMs: number): number {
  return (endsAtMs - nowMs) % MS_PER_SECOND || MS_PER_SECOND;
}

/**
 * Adds behavior to bar markup: the ticking countdown, the ended transition and dismissal.
 * Returns a function that stops the timer and removes listeners.
 */
export function enhance(root: HTMLElement, config: BarConfig, deps: EnhanceDeps = {}): () => void {
  const now = deps.now ?? (() => Date.now());
  const store = deps.store ?? createDismissalStore();
  const key = campaignKey(config);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeDismissListener = (): void => {};

  const stop = (): void => {
    clearTimeout(timer);
    timer = undefined;
    removeDismissListener();
  };

  const dismiss = (): void => {
    store.dismiss(key);
    stop();
    removeBar(root);
  };

  if (config.dismissible && store.isDismissed(key)) {
    removeBar(root);
    return stop;
  }

  if (config.dismissible) {
    const button = root.querySelector(`[${DISMISS_ATTRIBUTE}]`);
    button?.addEventListener('click', dismiss);
    removeDismissListener = () => button?.removeEventListener('click', dismiss);
  }

  const endsAtMs = config.endsAtMs;
  if (endsAtMs === undefined) return stop;

  const countdown = root.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`);
  const tick = (): void => {
    const nowMs = now();
    const left = remaining(endsAtMs, nowMs);
    if (left === 'ended') {
      timer = undefined;
      applyEnded(root, config);
      return;
    }
    if (countdown) countdown.textContent = formatCountdown(left);
    timer = setTimeout(tick, msUntilNextTick(endsAtMs, nowMs));
  };

  tick();
  return stop;
}
