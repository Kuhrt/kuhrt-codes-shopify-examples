import { COPY } from './copy';
import { TEST_ID } from './test-ids';
import type { EmbedCheck } from './use-embed-status';

const TONE = {
  active: 'success',
  inactive: 'warning',
  unknown: 'critical',
  checking: 'info'
} as const;

interface EmbedStatusCardProps {
  status: EmbedCheck;
  enableHref: string;
  onRecheck: () => void;
}

export function EmbedStatusCard({ status, enableHref, onRecheck }: EmbedStatusCardProps) {
  return (
    <s-section heading={COPY.embedHeading}>
      <s-stack gap="base">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-badge tone={TONE[status]} data-testid={TEST_ID.embedStatus} data-status={status}>
            {COPY.embedStatusLabel[status]}
          </s-badge>
          {status === 'checking' && (
            <s-spinner accessibilityLabel={COPY.checkingAccessibilityLabel} />
          )}
        </s-stack>
        {status === 'inactive' && (
          <>
            <s-paragraph>{COPY.embedInactiveExplanation}</s-paragraph>
            <s-button
              variant="primary"
              href={enableHref}
              target="_blank"
              data-testid={TEST_ID.enableEmbed}
            >
              {COPY.enableEmbed}
            </s-button>
          </>
        )}
        {status === 'unknown' && (
          <>
            <s-paragraph>{COPY.embedUnknownExplanation}</s-paragraph>
            <s-button onClick={onRecheck} data-testid={TEST_ID.recheck}>
              {COPY.recheck}
            </s-button>
          </>
        )}
        <s-paragraph data-testid={TEST_ID.perThemeGuidance}>
          {COPY.embedPerThemeGuidance}
        </s-paragraph>
      </s-stack>
    </s-section>
  );
}
