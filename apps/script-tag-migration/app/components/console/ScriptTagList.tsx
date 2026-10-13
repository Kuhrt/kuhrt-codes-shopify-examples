import { useState } from 'react';

import type { OwnedScriptTag } from '../../services/script-tags';
import { COPY } from './copy';
import { CONFIRM_MODAL_ID, RemoveConfirmModal } from './RemoveConfirmModal';
import { TEST_ID } from './test-ids';

// Pinned so the server and the browser render the same text.
const createdAtFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
  timeZoneName: 'short'
});

const formatDate = (iso: string) => createdAtFormat.format(new Date(iso));

interface ScriptTagListProps {
  tags: OwnedScriptTag[];
  removalDisabled: boolean;
  onRemove: (id: string) => void;
}

export function ScriptTagList({ tags, removalDisabled, onRemove }: ScriptTagListProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingTag = removalDisabled ? null : (tags.find((tag) => tag.id === pendingId) ?? null);

  const confirmRemoval = () => {
    if (pendingId === null || removalDisabled) return;
    onRemove(pendingId);
    setPendingId(null);
  };

  return (
    <>
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">{COPY.columnSource}</s-table-header>
          <s-table-header>{COPY.columnScope}</s-table-header>
          <s-table-header>{COPY.columnCreated}</s-table-header>
          <s-table-header>{COPY.columnActions}</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {tags.map((tag) => (
            <s-table-row key={tag.id} data-testid={TEST_ID.scriptTagRow} data-tag-id={tag.id}>
              <s-table-cell>{tag.src}</s-table-cell>
              <s-table-cell>{tag.displayScope}</s-table-cell>
              <s-table-cell data-testid={TEST_ID.createdAt}>
                {formatDate(tag.createdAt)}
              </s-table-cell>
              <s-table-cell>
                <s-button
                  tone="critical"
                  accessibilityLabel={COPY.removeLabel(tag.src)}
                  disabled={removalDisabled || undefined}
                  commandFor={CONFIRM_MODAL_ID}
                  command="--show"
                  onClick={() => setPendingId(tag.id)}
                  data-testid={TEST_ID.removeButton}
                  data-tag-id={tag.id}
                >
                  {COPY.remove}
                </s-button>
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
      <RemoveConfirmModal
        tag={pendingTag}
        confirmDisabled={removalDisabled}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingId(null)}
      />
    </>
  );
}
