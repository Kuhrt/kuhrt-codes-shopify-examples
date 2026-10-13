// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OwnedScriptTag } from '../../services/script-tags';
import { STEP } from '../../services/script-tags';
import { ConsoleView } from './ConsoleView';
import { themeEditorLink } from './embed';
import { TEST_ID } from './test-ids';
import type { EmbedCheck } from './use-embed-status';

afterEach(cleanup);

const tags: OwnedScriptTag[] = [
  {
    id: 'gid://shopify/ScriptTag/1',
    src: 'https://a.example/one.js',
    displayScope: 'ONLINE_STORE',
    createdAt: '2026-01-02T00:00:00Z'
  },
  {
    id: 'gid://shopify/ScriptTag/2',
    src: 'https://a.example/two.js',
    displayScope: 'ALL',
    createdAt: '2026-02-03T00:00:00Z'
  }
];

const enableHref = themeEditorLink('my-store', 'client-123');

function renderView(overrides: Partial<Parameters<typeof ConsoleView>[0]> = {}) {
  const props = {
    embedStatus: 'active' as EmbedCheck,
    enableHref,
    onRecheckEmbed: vi.fn(),
    scriptTags: { ok: true as const, tags },
    onRetryList: vi.fn(),
    removalBusy: false,
    removalError: null,
    onRemove: vi.fn(),
    ...overrides
  };
  render(<ConsoleView {...props} />);
  return props;
}

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
      expect(at([...at(rows, index).querySelectorAll('s-table-cell')], 2).textContent).not.toBe('');
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
});

describe('removal confirmation', () => {
  it('does not remove until confirmed, then removes the chosen tag', () => {
    const { onRemove } = renderView();

    fireEvent.click(at(removeButtons(), 1));
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(at(tags, 1).id);
  });

  it('removes nothing when cancelled', () => {
    const { onRemove } = renderView();
    fireEvent.click(at(removeButtons(), 0));
    fireEvent.click(screen.getByTestId(TEST_ID.cancelRemove));
    expect(onRemove).not.toHaveBeenCalled();
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
