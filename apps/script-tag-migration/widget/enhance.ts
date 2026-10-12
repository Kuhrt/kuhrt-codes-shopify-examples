import type { BarConfig } from './config';
import { formatCountdown, remaining } from './countdown';
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

const TICK_INTERVAL_MS = 1000;

function moveFocusToBody(doc: Document): void {
  const body = doc.body;
  if (!body.hasAttribute('tabindex')) {
    body.setAttribute('tabindex', '-1');
    body.addEventListener('blur', () => body.removeAttribute('tabindex'), { once: true });
  }
  body.focus();
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
    root.remove();
  }
}

/**
 * Adds behavior to bar markup: the ticking countdown, the ended transition and dismissal.
 * Returns a function that stops the timer and removes listeners.
 */
export function enhance(root: HTMLElement, config: BarConfig, deps: EnhanceDeps = {}): () => void {
  const now = deps.now ?? (() => Date.now());
  const store = deps.store ?? createDismissalStore();
  const key = campaignKey(config);
  let timer: ReturnType<typeof setInterval> | undefined;
  let removeDismissListener = (): void => {};

  const stop = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    removeDismissListener();
  };

  const dismiss = (): void => {
    store.dismiss(key);
    stop();
    root.remove();
    moveFocusToBody(root.ownerDocument);
  };

  if (config.dismissible && store.isDismissed(key)) {
    root.remove();
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
    const left = remaining(endsAtMs, now());
    if (left === 'ended') {
      clearInterval(timer);
      timer = undefined;
      applyEnded(root, config);
    } else if (countdown) {
      countdown.textContent = formatCountdown(left);
    }
  };

  timer = setInterval(tick, TICK_INTERVAL_MS);
  tick();
  return stop;
}
