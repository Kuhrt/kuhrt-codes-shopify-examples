import labels from '../extensions/announcement-bar/locales/en.default.json';

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

export type RawSettings = Record<string, string | undefined>;

export const ENDED_BEHAVIOR = {
  hide: 'hide',
  message: 'message'
} as const;

export const ROOT_ATTRIBUTE = 'data-kc-announcement-bar';
export const MESSAGE_ATTRIBUTE = 'data-kc-text';
export const COUNTDOWN_ATTRIBUTE = 'data-kc-countdown';
export const DISMISS_ATTRIBUTE = 'data-kc-dismiss';
export const ENDED_ATTRIBUTE = 'data-kc-ended';

export const BACKGROUND_PROPERTY = '--kc-bar-background';
export const TEXT_PROPERTY = '--kc-bar-color';

export const INVALID_ATTRIBUTE = 'data-kc-invalid';
export const DESIGN_MODE_ATTRIBUTE = 'data-kc-design-mode';

/** Root attributes only the embed's markup carries, so the legacy bar never has them. */
export const EMBED_ONLY_ATTRIBUTES: readonly string[] = [INVALID_ATTRIBUTE, DESIGN_MODE_ATTRIBUTE];

export const DEFAULT_LABELS = labels.announcement_bar;

/** The root data attribute that carries a setting's value, e.g. `link_url` becomes `data-kc-link-url`. */
export function dataAttributeFor(setting: SettingName): string {
  return `data-kc-${setting.replaceAll('_', '-')}`;
}

/** Reads every known setting through `get`; a missing value is `undefined`. */
export function readSettings(
  get: (setting: SettingName) => string | null | undefined
): RawSettings {
  const raw: RawSettings = {};
  for (const setting of Object.values(SETTING)) {
    raw[setting] = get(setting) ?? undefined;
  }
  return raw;
}

/** Reads the raw settings carried on a bar root. */
export function readRawSettings(root: Element): RawSettings {
  return readSettings((setting) => root.getAttribute(dataAttributeFor(setting)));
}
