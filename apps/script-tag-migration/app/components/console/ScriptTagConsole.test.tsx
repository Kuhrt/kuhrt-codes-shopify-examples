// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsoleActionData, OwnedScriptTag } from '../../services/script-tags';
import { FIELD, INTENT, STEP } from '../../services/script-tags';
import { TAG_A as tag } from '../../services/script-tags.fixtures';
import { BLOCK_HANDLE } from './embed';
import { extensionsPayload } from './extensions-fixture';
import { ScriptTagConsole } from './ScriptTagConsole';
import { TEST_ID } from './test-ids';

const toastShow = vi.fn();
const extensions = vi.fn();

beforeEach(() => {
  extensions.mockResolvedValue(extensionsPayload({ status: 'active' }));
  vi.stubGlobal('shopify', { app: { extensions }, toast: { show: toastShow } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastShow.mockReset();
  extensions.mockReset();
});

/** The loader serves the remaining tags; a successful action removes the deleted tag from them. */
function renderConsole(actionResult: ConsoleActionData) {
  const submitted: FormData[] = [];
  let remaining: OwnedScriptTag[] = [tag];
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: ScriptTagConsole,
      HydrateFallback: () => null,
      loader: () => ({
        clientId: 'client-123',
        storeHandle: 'my-store',
        scriptTags: { ok: true, tags: remaining }
      }),
      action: async ({ request }) => {
        submitted.push(await request.formData());
        if (actionResult.ok) {
          remaining = remaining.filter(({ id }) => id !== actionResult.deletedId);
        }
        return actionResult;
      }
    }
  ]);
  render(<Stub />);
  return submitted;
}

async function removableTag() {
  await waitFor(() => {
    const button = screen.getByTestId(TEST_ID.removeButton);
    expect(button.hasAttribute('disabled')).toBe(false);
  });
  return screen.getByTestId(TEST_ID.removeButton);
}

describe('ScriptTagConsole', () => {
  it('builds the enable link from the loader data when the embed is inactive', async () => {
    extensions.mockResolvedValue(extensionsPayload({ status: 'available' }));
    renderConsole({ ok: true, deletedId: tag.id });

    const href = new URL(
      (await screen.findByTestId(TEST_ID.enableEmbed)).getAttribute('href') ?? ''
    );
    expect(href.pathname).toBe('/store/my-store/themes/current/editor');
    expect(href.searchParams.get('activateAppId')).toBe(`client-123/${BLOCK_HANDLE}`);
  });

  it('keeps removal locked when the embed status lookup fails', async () => {
    extensions.mockRejectedValue(new Error('unavailable'));
    renderConsole({ ok: true, deletedId: tag.id });

    await screen.findByTestId(TEST_ID.recheck);
    expect(screen.getByTestId(TEST_ID.removeButton).hasAttribute('disabled')).toBe(true);
  });

  it('submits nothing until the removal is confirmed, then posts the delete intent and id', async () => {
    const submitted = renderConsole({ ok: true, deletedId: tag.id });

    fireEvent.click(await removableTag());
    expect(submitted).toHaveLength(0);

    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]?.get(FIELD.intent)).toBe(INTENT.delete);
    expect(submitted[0]?.get(FIELD.id)).toBe(tag.id);
  });

  it('removes the tag from the list and announces it once, with no error', async () => {
    renderConsole({ ok: true, deletedId: tag.id });

    fireEvent.click(await removableTag());
    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));

    await waitFor(() => expect(screen.queryByTestId(TEST_ID.scriptTagRow)).toBeNull());
    expect(toastShow).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(TEST_ID.removalError)).toBeNull();
  });

  it('shows the failure reason and no success toast when the removal fails', async () => {
    renderConsole({
      ok: false,
      step: STEP.deleteScriptTag,
      failure: { ok: false, kind: 'user-error', message: 'denied' }
    });

    fireEvent.click(await removableTag());
    fireEvent.click(screen.getByTestId(TEST_ID.confirmRemove));

    const error = await screen.findByTestId(TEST_ID.removalError);
    expect(error.textContent).toContain('denied');
    expect(toastShow).not.toHaveBeenCalled();
  });
});
