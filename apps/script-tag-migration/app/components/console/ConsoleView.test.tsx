// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STEP } from '../../services/script-tags';
import { TAG_A, TAG_B } from '../../services/script-tags.fixtures';
import { ConsoleView } from './ConsoleView';
import { themeEditorLink } from './embed';
import { TEST_ID } from './test-ids';
import type { EmbedCheck } from './use-embed-status';

afterEach(cleanup);

const tags = [TAG_A, TAG_B];

const enableHref = themeEditorLink('my-store', 'client-123');

type ViewProps = Parameters<typeof ConsoleView>[0];

function renderView(overrides: Partial<ViewProps> = {}) {
  const props: ViewProps = {
    embedStatus: 'active' as EmbedCheck,
    embedChecking: false,
    enableHref,
    onRecheckEmbed: vi.fn(),
    scriptTags: { ok: true as const, tags },
    onRetryList: vi.fn(),
    retryingList: false,
    removalBusy: false,
    removalError: null,
    onRemove: vi.fn(),
    ...overrides
  };
  const { rerender } = render(<ConsoleView {...props} />);
  return {
    ...props,
    rerender: (changes: Partial<ViewProps>) => rerender(<ConsoleView {...props} {...changes} />)
  };
}

/** The modal element is unknown to happy-dom, so the overlay method it would expose is stubbed. */
function stubHideOverlay() {
  const hideOverlay = vi.fn();
  Object.assign(screen.getByTestId(TEST_ID.confirmModal), { hideOverlay });
  return hideOverlay;
}

const isLoading = (element: HTMLElement) => element.hasAttribute('loading');

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item at ${index}`);
  return item;
}

const removeButtons = () => screen.queryAllByTestId(TEST_ID.removeButton);
const isDisabled = (element: HTMLElement) => element.hasAttribute('disabled');

describe('embed status', () => {
  it.each(['active', 'inactive', 'unknown', 'checking'] as const)(
    'reports the %s state',
    (embedStatus) => {
      renderView({ embedStatus });
      expect(screen.getByTestId(TEST_ID.embedStatus).getAttribute('data-status')).toBe(embedStatus);
    }
  );

  it('offers the enable action with the deep link only when inactive', () => {
    renderView({ embedStatus: 'inactive' });
    expect(screen.getByTestId(TEST_ID.enableEmbed).getAttribute('href')).toBe(enableHref);
    expect(screen.queryByTestId(TEST_ID.recheck)).toBeNull();
  });

  it.each(['active', 'unknown', 'checking'] as const)(
    'does not offer the enable action when %s',
    (embedStatus) => {
      renderView({ embedStatus });
      expect(screen.queryByTestId(TEST_ID.enableEmbed)).toBeNull();
    }
  );

  it('offers a retry when unknown, which rechecks', () => {
    const { onRecheckEmbed } = renderView({ embedStatus: 'unknown' });
    fireEvent.click(screen.getByTestId(TEST_ID.recheck));
    expect(onRecheckEmbed).toHaveBeenCalledOnce();
  });

  it.each(['active', 'inactive', 'unknown', 'checking'] as const)(
    'shows per-theme guidance when %s',
    (embedStatus) => {
      renderView({ embedStatus });
      expect(screen.getByTestId(TEST_ID.perThemeGuidance)).toBeTruthy();
    }
  );
});

describe('script tag list', () => {
  it('lists every tag with its source, scope and creation date', () => {
    renderView();
    const rows = screen.getAllByTestId(TEST_ID.scriptTagRow);
    expect(rows.map((row) => row.getAttribute('data-tag-id'))).toEqual(tags.map((tag) => tag.id));
    tags.forEach((tag, index) => {
      const row = within(at(rows, index));
      expect(row.getByText(tag.src)).toBeTruthy();
      expect(row.getByText(tag.displayScope)).toBeTruthy();
    });
  });

  it('formats the creation date in UTC so the server and browser render the same text', () => {
    renderView();
    const dates = screen.getAllByTestId(TEST_ID.createdAt).map((cell) => cell.textContent);
    expect(dates).toEqual(['Jan 2, 2026, UTC', 'Feb 3, 2026, UTC']);
  });

  it('labels each remove action with the tag it removes', () => {
    renderView();
    tags.forEach((tag, index) => {
      expect(at(removeButtons(), index).getAttribute('accessibilitylabel')).toContain(tag.src);
    });
  });

  it('shows the cleanup as complete when there are no tags', () => {
    renderView({ scriptTags: { ok: true, tags: [] } });
    expect(screen.getByTestId(TEST_ID.cleanupComplete)).toBeTruthy();
    expect(screen.queryByTestId(TEST_ID.listError)).toBeNull();
    expect(removeButtons()).toHaveLength(0);
  });

  it('shows an error naming the failed step, with retry, and not an empty list', () => {
    const { onRetryList } = renderView({
      scriptTags: {
        ok: false,
        step: STEP.listScriptTags,
        failure: { ok: false, kind: 'network', message: 'boom' }
      }
    });
    const error = screen.getByTestId(TEST_ID.listError);
    expect(error.getAttribute('data-step')).toBe(STEP.listScriptTags);
    expect(error.textContent).toContain('boom');
    expect(screen.queryByTestId(TEST_ID.cleanupComplete)).toBeNull();
    fireEvent.click(screen.getByTestId(TEST_ID.retryList));
    expect(onRetryList).toHaveBeenCalledOnce();
  });

  it.each([true, false])('marks the retry action loading=%s while the list reloads', (retrying) => {
    renderView({
      retryingList: retrying,
      scriptTags: {
        ok: false,
        step: STEP.listScriptTags,
        failure: { ok: false, kind: 'network', message: 'boom' }
      }
    });
    expect(isLoading(screen.getByTestId(TEST_ID.retryList))).toBe(retrying);
  });
});

describe('removal gate', () => {
  it('enables every remove action only when the embed is active', () => {
    renderView({ embedStatus: 'active' });
    expect(removeButtons()).toHaveLength(tags.length);
    expect(removeButtons().some(isDisabled)).toBe(false);
    expect(screen.queryByTestId(TEST_ID.removeGate)).toBeNull();
  });

  it.each(['inactive', 'unknown', 'checking'] as const)(
    'disables every remove action when %s, with an explanation',
    (embedStatus) => {
      renderView({ embedStatus });
      expect(removeButtons()).toHaveLength(tags.length);
      expect(removeButtons().every(isDisabled)).toBe(true);
      expect(screen.getByTestId(TEST_ID.removeGate)).toBeTruthy();
    }
  );

  it('disables removal while a removal is in flight', () => {
    renderView({ removalBusy: true });
    expect(removeButtons().every(isDisabled)).toBe(true);
  });

  it('disables removal while the embed is being re-checked, even from active', () => {
    renderView({ embedStatus: 'active', embedChecking: true });
    expect(removeButtons().every(isDisabled)).toBe(true);
  });

  it.each([true, false])('marks the re-check action loading=%s while checking', (checking) => {
    renderView({ embedStatus: 'unknown', embedChecking: checking });
    expect(isLoading(screen.getByTestId(TEST_ID.recheck))).toBe(checking);
  });
});

describe('removal confirmation', () => {
  it('does not remove until confirmed, then removes the chosen tag', () => {
    const { onRemove } = renderView();

    fireEvent.click(at(removeButtons(), 1));
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(at(tags, 1).id);
  });

  it('removes nothing when cancelled, and forgets the pending tag', () => {
    const { onRemove } = renderView();
    fireEvent.click(at(removeButtons(), 0));
    fireEvent.click(screen.getByTestId(TEST_ID.cancelRemove));
    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('forgets the pending tag once it is removed', () => {
    const { onRemove } = renderView();
    fireEvent.click(at(removeButtons(), 0));
    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('names the pending tag in the confirmation', () => {
    renderView();
    fireEvent.click(at(removeButtons(), 1));
    expect(screen.getByTestId(TEST_ID.confirmTag).textContent).toBe(TAG_B.src);
  });

  it('leaves the confirm action enabled while removal is available', () => {
    renderView();
    fireEvent.click(at(removeButtons(), 0));
    expect(isDisabled(screen.getByTestId(TEST_ID.confirmRemove))).toBe(false);
  });

  describe.each([
    ['inactive', { embedStatus: 'inactive' }],
    ['unknown', { embedStatus: 'unknown' }],
    ['checking', { embedStatus: 'checking' }],
    ['re-checking from active', { embedChecking: true }],
    ['busy', { removalBusy: true }]
  ] as const)('when removal becomes unavailable (%s) with the modal open', (_name, closed) => {
    it('does not remove on confirm, disables the confirm action and hides the modal', () => {
      const view = renderView();
      const hideOverlay = stubHideOverlay();
      fireEvent.click(at(removeButtons(), 0));
      expect(hideOverlay).not.toHaveBeenCalled();

      view.rerender(closed);

      expect(hideOverlay).toHaveBeenCalledOnce();
      expect(isDisabled(screen.getByTestId(TEST_ID.confirmRemove))).toBe(true);
      fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
      expect(view.onRemove).not.toHaveBeenCalled();
    });
  });

  it('does not touch the modal when removal becomes unavailable while it is closed', () => {
    const view = renderView();
    const hideOverlay = stubHideOverlay();
    view.rerender({ embedStatus: 'inactive' });
    expect(hideOverlay).not.toHaveBeenCalled();
  });

  it('wires remove to show the modal and confirm and cancel to hide it', () => {
    renderView();
    const modalId = screen.getByTestId(TEST_ID.confirmModal).id;
    for (const button of removeButtons()) {
      expect(button.getAttribute('commandfor')).toBe(modalId);
      expect(button.getAttribute('command')).toBe('--show');
    }
    for (const id of [TEST_ID.confirmRemove, TEST_ID.cancelRemove]) {
      expect(screen.getByTestId(id).getAttribute('commandfor')).toBe(modalId);
      expect(screen.getByTestId(id).getAttribute('command')).toBe('--hide');
    }
  });
});

describe('removal failure', () => {
  it('shows the reason and the step, and keeps the tags listed', () => {
    renderView({
      removalError: {
        ok: false,
        step: STEP.deleteScriptTag,
        failure: { ok: false, kind: 'user-error', message: 'denied' }
      }
    });
    const error = screen.getByTestId(TEST_ID.removalError);
    expect(error.getAttribute('data-step')).toBe(STEP.deleteScriptTag);
    expect(error.textContent).toContain('denied');
    expect(screen.getAllByTestId(TEST_ID.scriptTagRow)).toHaveLength(tags.length);
  });

  it('shows no removal error by default', () => {
    renderView();
    expect(screen.queryByTestId(TEST_ID.removalError)).toBeNull();
  });
});
