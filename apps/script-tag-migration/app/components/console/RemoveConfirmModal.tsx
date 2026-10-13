import { COPY } from './copy';
import { TEST_ID } from './test-ids';

export const CONFIRM_MODAL_ID = 'confirm-remove-modal';

interface RemoveConfirmModalProps {
  onConfirm: () => void;
}

export function RemoveConfirmModal({ onConfirm }: RemoveConfirmModalProps) {
  return (
    <s-modal id={CONFIRM_MODAL_ID} heading={COPY.confirmHeading} data-testid={TEST_ID.confirmModal}>
      <s-paragraph>{COPY.confirmBody}</s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
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
        data-testid={TEST_ID.cancelRemove}
      >
        {COPY.cancel}
      </s-button>
    </s-modal>
  );
}
