import { useEffect, useRef } from 'react';

import type { OwnedScriptTag } from '../../services/script-tags';
import { COPY } from './copy';
import { TEST_ID } from './test-ids';

export const CONFIRM_MODAL_ID = 'confirm-remove-modal';

interface RemoveConfirmModalProps {
  /** The script tag awaiting confirmation, or null when none is. */
  tag: OwnedScriptTag | null;
  confirmDisabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RemoveConfirmModal({
  tag,
  confirmDisabled,
  onConfirm,
  onCancel
}: RemoveConfirmModalProps) {
  const modal = useRef<HTMLElementTagNameMap['s-modal']>(null);

  const previousTag = useRef<OwnedScriptTag | null>(null);

  // The list withholds the pending tag while removal is unavailable; a modal left open is closed here.
  useEffect(() => {
    if (previousTag.current !== null && tag === null && confirmDisabled) {
      modal.current?.hideOverlay();
    }
    previousTag.current = tag;
  }, [tag, confirmDisabled]);

  return (
    <s-modal
      ref={modal}
      id={CONFIRM_MODAL_ID}
      heading={COPY.confirmHeading}
      data-testid={TEST_ID.confirmModal}
    >
      <s-paragraph data-testid={TEST_ID.confirmTag}>{tag?.src}</s-paragraph>
      <s-paragraph>{COPY.confirmBody}</s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        disabled={confirmDisabled || undefined}
        commandFor={CONFIRM_MODAL_ID}
        command="--hide"
        onClick={onConfirm}
        data-testid={TEST_ID.confirmRemove}
      >
        {COPY.confirmRemove}
      </s-button>
      <s-button
        slot="secondary-actions"
        commandFor={CONFIRM_MODAL_ID}
        command="--hide"
        onClick={onCancel}
        data-testid={TEST_ID.cancelRemove}
      >
        {COPY.cancel}
      </s-button>
    </s-modal>
  );
}
