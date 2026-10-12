export const SETTING = {
  message: 'message',
  linkUrl: 'link_url',
  endsAt: 'ends_at',
  endedBehavior: 'ended_behavior',
  endedMessage: 'ended_message',
  dismissible: 'dismissible',
  backgroundColor: 'background_color',
  textColor: 'text_color'
} as const;

export type SettingName = (typeof SETTING)[keyof typeof SETTING];

export const ENDED_BEHAVIOR = {
  hide: 'hide',
  message: 'message'
} as const;

export type EndedBehavior = (typeof ENDED_BEHAVIOR)[keyof typeof ENDED_BEHAVIOR];

export const ROOT_ATTRIBUTE = 'data-kc-announcement-bar';
export const MESSAGE_ATTRIBUTE = 'data-kc-message';
export const COUNTDOWN_ATTRIBUTE = 'data-kc-countdown';
export const DISMISS_ATTRIBUTE = 'data-kc-dismiss';
export const ENDED_ATTRIBUTE = 'data-kc-ended';

export const BACKGROUND_PROPERTY = '--kc-bar-background';
export const TEXT_PROPERTY = '--kc-bar-color';

export const DEFAULT_LABELS = {
  region: 'Announcement',
  dismiss: 'Dismiss announcement'
} as const;

/** The root data attribute that carries a setting's value, e.g. `link_url` becomes `data-link-url`. */
export function dataAttributeFor(setting: SettingName): string {
  return `data-${setting.replaceAll('_', '-')}`;
}
