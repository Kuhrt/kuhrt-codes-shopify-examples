import type { ReactNode } from 'react';

import type { ScriptTagsState, StepFailure } from '../../services/script-tags';
import { COPY, STEP_LABEL } from './copy';
import { EmbedStatusCard } from './EmbedStatusCard';
import { ScriptTagList } from './ScriptTagList';
import { TEST_ID } from './test-ids';
import type { EmbedCheck } from './use-embed-status';

interface FailureBannerProps {
  heading: string;
  error: StepFailure;
  testId: string;
  children?: ReactNode;
}

function FailureBanner({ heading, error, testId, children }: FailureBannerProps) {
  return (
    <s-banner tone="critical" heading={heading} data-testid={testId} data-step={error.step}>
      <s-paragraph>
        {STEP_LABEL[error.step]}: {error.failure.message}
      </s-paragraph>
      {children}
    </s-banner>
  );
}

interface ConsoleViewProps {
  embedStatus: EmbedCheck;
  embedChecking: boolean;
  enableHref: string;
  onRecheckEmbed: () => void;
  scriptTags: ScriptTagsState;
  onRetryList: () => void;
  retryingList: boolean;
  removalBusy: boolean;
  removalError: StepFailure | null;
  onRemove: (id: string) => void;
}

export function ConsoleView({
  embedStatus,
  embedChecking,
  enableHref,
  onRecheckEmbed,
  scriptTags,
  onRetryList,
  retryingList,
  removalBusy,
  removalError,
  onRemove
}: ConsoleViewProps) {
  const gated = embedStatus !== 'active';
  const removalDisabled = gated || embedChecking || removalBusy;

  return (
    <s-page heading={COPY.pageHeading}>
      <EmbedStatusCard
        status={embedStatus}
        checking={embedChecking}
        enableHref={enableHref}
        onRecheck={onRecheckEmbed}
      />
      <s-section heading={COPY.scriptTagsHeading}>
        <s-stack gap="base">
          {removalError && (
            <FailureBanner
              heading={COPY.removeFailed}
              error={removalError}
              testId={TEST_ID.removalError}
            />
          )}
          {!scriptTags.ok && (
            <FailureBanner heading={COPY.listFailed} error={scriptTags} testId={TEST_ID.listError}>
              <s-button
                slot="primary-action"
                loading={retryingList || undefined}
                onClick={onRetryList}
                data-testid={TEST_ID.retryList}
              >
                {COPY.retryList}
              </s-button>
            </FailureBanner>
          )}
          {scriptTags.ok && scriptTags.tags.length === 0 && (
            <s-banner tone="success" data-testid={TEST_ID.cleanupComplete}>
              {COPY.cleanupComplete}
            </s-banner>
          )}
          {scriptTags.ok && scriptTags.tags.length > 0 && (
            <>
              {gated && (
                <s-banner tone="warning" data-testid={TEST_ID.removeGate}>
                  {COPY.removeGate}
                </s-banner>
              )}
              <ScriptTagList
                tags={scriptTags.tags}
                removalDisabled={removalDisabled}
                onRemove={onRemove}
              />
            </>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
