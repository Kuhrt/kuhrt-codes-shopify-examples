// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionList } from './embed';
import { extensionsPayload } from './extensions-fixture';
import { useEmbedStatus } from './use-embed-status';

const extensions = vi.fn();

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  extensions.mockResolvedValue(extensionsPayload({ status: 'available' }));
  vi.stubGlobal('shopify', { app: { extensions } });
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  extensions.mockReset();
});

describe('useEmbedStatus', () => {
  it('starts checking, then reports the mapped status', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('inactive'));
  });

  it('is unknown when the call rejects', async () => {
    extensions.mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('unknown'));
  });

  it('checks again when the window regains focus', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('inactive'));

    extensions.mockResolvedValue(extensionsPayload({ status: 'active' }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(extensions).toHaveBeenCalledTimes(2);
  });

  it('checks again when the document becomes visible, but not when it is hidden', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('inactive'));

    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(extensions).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(extensions).toHaveBeenCalledTimes(2));
  });

  it('checks again on demand', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('inactive'));

    extensions.mockResolvedValue(extensionsPayload({ status: 'active' }));
    await act(() => result.current.recheck());

    expect(result.current.status).toBe('active');
    expect(extensions).toHaveBeenCalledTimes(2);
  });

  it('is checking until the first result arrives, then is not', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    expect(result.current.checking).toBe(true);
    await waitFor(() => expect(result.current.checking).toBe(false));
  });

  it('keeps the previous status but reports checking while re-checking', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('inactive'));

    const pending = deferred<ExtensionList>();
    extensions.mockReturnValue(pending.promise);
    let recheck: Promise<void> = Promise.resolve();
    act(() => {
      recheck = result.current.recheck();
    });

    expect(result.current.checking).toBe(true);
    expect(result.current.status).toBe('inactive');

    pending.resolve(extensionsPayload({ status: 'active' }));
    await act(() => recheck);
    expect(result.current.checking).toBe(false);
    expect(result.current.status).toBe('active');
  });

  it('becomes unknown when a re-check from active rejects', async () => {
    extensions.mockResolvedValue(extensionsPayload({ status: 'active' }));
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('active'));

    extensions.mockRejectedValue(new Error('unavailable'));
    await act(() => result.current.recheck());

    expect(result.current.status).toBe('unknown');
    expect(result.current.checking).toBe(false);
  });

  it('applies the latest check when an earlier one resolves after it', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.checking).toBe(false));

    const earlier = deferred<ExtensionList>();
    const later = deferred<ExtensionList>();
    extensions.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.recheck();
      second = result.current.recheck();
    });

    later.resolve(extensionsPayload({ status: 'active' }));
    await act(() => second);
    earlier.resolve(extensionsPayload({ status: 'available' }));
    await act(() => first);

    expect(result.current.status).toBe('active');
    expect(result.current.checking).toBe(false);
  });

  it('stays checking until the latest check resolves, even if an earlier one finishes first', async () => {
    const { result } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.checking).toBe(false));

    const earlier = deferred<ExtensionList>();
    const later = deferred<ExtensionList>();
    extensions.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.recheck();
      void result.current.recheck();
    });

    earlier.resolve(extensionsPayload({ status: 'active' }));
    await act(() => first);

    expect(result.current.checking).toBe(true);
    expect(result.current.status).toBe('inactive');
  });

  it('stops listening once unmounted', async () => {
    const { result, unmount } = renderHook(() => useEmbedStatus());
    await waitFor(() => expect(result.current.status).toBe('inactive'));
    unmount();

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(extensions).toHaveBeenCalledTimes(1);
  });
});
