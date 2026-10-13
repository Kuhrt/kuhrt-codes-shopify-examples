// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extensionsPayload } from './extensions-fixture';
import { useEmbedStatus } from './use-embed-status';

const extensions = vi.fn();

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

    await act(() => result.current.recheck());
    expect(extensions).toHaveBeenCalledTimes(2);
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
