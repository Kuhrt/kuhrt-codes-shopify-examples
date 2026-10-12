// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { campaignKey, createDismissalStore } from './dismissal';

function throwingStorage(): Storage {
  const fail = (): never => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { getItem: fail, setItem: fail } as unknown as Storage;
}

afterEach(() => {
  localStorage.clear();
});

describe('campaignKey', () => {
  const base = { message: 'Sale', endsAtMs: 1_800_000_000_000 };

  it('is stable for the same campaign', () => {
    expect(campaignKey(base)).toBe(campaignKey({ ...base }));
  });

  it('changes when the message changes', () => {
    expect(campaignKey({ ...base, message: 'Other sale' })).not.toBe(campaignKey(base));
  });

  it('changes when the end time changes', () => {
    expect(campaignKey({ ...base, endsAtMs: base.endsAtMs + 1000 })).not.toBe(campaignKey(base));
  });

  it('differs between having no end time and having one', () => {
    expect(campaignKey({ message: 'Sale' })).not.toBe(campaignKey(base));
  });

  it('is short and storage-safe', () => {
    expect(campaignKey(base)).toMatch(/^[0-9a-z]{1,8}$/);
  });
});

describe('createDismissalStore', () => {
  it('starts undismissed', () => {
    expect(createDismissalStore().isDismissed('abc')).toBe(false);
  });

  it('persists a dismissal across store instances (page loads)', () => {
    createDismissalStore().dismiss('abc');
    expect(createDismissalStore().isDismissed('abc')).toBe(true);
  });

  it('keeps campaigns independent, so a new campaign reappears', () => {
    const store = createDismissalStore();
    store.dismiss(campaignKey({ message: 'Old' }));
    expect(createDismissalStore().isDismissed(campaignKey({ message: 'New' }))).toBe(false);
  });

  describe('when storage throws', () => {
    it('does not throw on read and reports undismissed', () => {
      expect(createDismissalStore(throwingStorage).isDismissed('abc')).toBe(false);
    });

    it('does not throw on write and remembers the dismissal for the current page', () => {
      const store = createDismissalStore(throwingStorage);
      expect(() => store.dismiss('abc')).not.toThrow();
      expect(store.isDismissed('abc')).toBe(true);
    });

    it('does not carry the dismissal to a new page', () => {
      createDismissalStore(throwingStorage).dismiss('abc');
      expect(createDismissalStore(throwingStorage).isDismissed('abc')).toBe(false);
    });

    it('survives the storage accessor itself throwing', () => {
      const store = createDismissalStore(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      expect(() => store.dismiss('abc')).not.toThrow();
      expect(store.isDismissed('abc')).toBe(true);
    });
  });

  it('falls back to memory when localStorage is blocked globally', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const store = createDismissalStore();
    store.dismiss('abc');
    expect(store.isDismissed('abc')).toBe(true);
    vi.restoreAllMocks();
  });
});
