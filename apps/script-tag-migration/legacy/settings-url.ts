import type { BarConfig } from '../widget/config';
import { toRawSettings } from '../widget/config';

export const LEGACY_SCRIPT_PATH = '/legacy/announcement-bar.js';

/** The query string (without `?`) the legacy script reads its settings from. Unset settings are omitted. */
export function toQuery(settings: BarConfig): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(toRawSettings(settings))) {
    if (value !== undefined) params.set(name, value);
  }
  return params.toString();
}

/** The absolute script URL for `settings`, served from the origin of `appUrl`, which must be https. */
export function legacyScriptUrl(appUrl: string, settings: BarConfig): string {
  const url = new URL(LEGACY_SCRIPT_PATH, appUrl);
  if (url.protocol !== 'https:') {
    throw new TypeError(`The app URL must be https, got ${url.protocol}`);
  }
  url.search = toQuery(settings);
  return url.toString();
}
