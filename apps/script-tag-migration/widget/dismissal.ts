import type { BarConfig } from './config';

export interface DismissalStore {
  isDismissed(campaignKey: string): boolean;
  dismiss(campaignKey: string): void;
}

const STORAGE_PREFIX = 'kc-announcement-bar:dismissed:';
const DISMISSED_VALUE = '1';
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Short stable hash (FNV-1a, base 36) of the campaign identity: message plus end time. */
export function campaignKey(config: Pick<BarConfig, 'message' | 'endsAtMs'>): string {
  const identity = `${config.message}\n${config.endsAtMs ?? ''}`;
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Dismissed-state backed by `localStorage`, with an in-memory copy for the current page.
 * Storage failures are swallowed: dismissal then lasts only until the page unloads.
 */
export function createDismissalStore(
  getStorage: () => Storage = () => globalThis.localStorage
): DismissalStore {
  const dismissedThisPage = new Set<string>();

  return {
    isDismissed(key) {
      if (dismissedThisPage.has(key)) return true;
      try {
        return getStorage().getItem(STORAGE_PREFIX + key) === DISMISSED_VALUE;
      } catch {
        return false;
      }
    },
    dismiss(key) {
      dismissedThisPage.add(key);
      try {
        getStorage().setItem(STORAGE_PREFIX + key, DISMISSED_VALUE);
      } catch {
        // Storage is unavailable; the in-memory copy still applies to this page.
      }
    }
  };
}

/** A store that never reports a dismissal and never keeps one, so a preview always shows the bar. */
export function createEphemeralDismissalStore(): DismissalStore {
  return {
    isDismissed: () => false,
    dismiss: () => {}
  };
}
