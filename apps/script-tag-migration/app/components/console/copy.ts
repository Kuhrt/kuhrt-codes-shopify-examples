import type { Step } from '../../services/script-tags';
import { STEP } from '../../services/script-tags';

export const COPY = {
  pageHeading: 'Script tag migration',
  embedHeading: 'Step 1: Enable the announcement bar app embed',
  embedPerThemeGuidance:
    'App embeds are activated per theme. If you publish a different theme, enable the embed on it and check the status again.',
  embedStatusLabel: {
    active: 'Active',
    inactive: 'Inactive',
    unknown: 'Unknown',
    checking: 'Checking'
  },
  embedInactiveExplanation: 'The embed is not enabled on your published theme.',
  embedUnknownExplanation:
    'The embed status could not be determined. Removal stays locked until the embed is confirmed active.',
  enableEmbed: 'Enable app embed',
  recheck: 'Check again',
  checkingAccessibilityLabel: 'Checking the app embed status',
  scriptTagsHeading: 'Step 2: Remove legacy script tags',
  removeGate: 'Enable the app embed and confirm it is active before removing script tags.',
  cleanupComplete: 'No legacy script tags remain. This step is complete.',
  columnSource: 'Source',
  columnScope: 'Display scope',
  columnCreated: 'Created',
  columnActions: 'Actions',
  remove: 'Remove',
  removeLabel: (src: string) => `Remove script tag ${src}`,
  retryList: 'Retry',
  confirmHeading: 'Remove this script tag?',
  confirmBody:
    'Removal is permanent. Shopify blocks creating script tags, so a removed script tag cannot be recreated.',
  confirmRemove: 'Remove permanently',
  cancel: 'Cancel',
  removed: 'Script tag removed',
  removeFailed: 'The script tag was not removed.',
  listFailed: 'The script tags could not be loaded.'
} as const;

export const STEP_LABEL: Record<Step, string> = {
  [STEP.listScriptTags]: 'Listing script tags',
  [STEP.deleteScriptTag]: 'Removing the script tag'
};
