import type { BarConfig } from './config';
import { toEpochSeconds, toRawSettings } from './config';
import type { SettingName } from './settings';
import {
  BACKGROUND_PROPERTY,
  COUNTDOWN_ATTRIBUTE,
  dataAttributeFor,
  DEFAULT_LABELS,
  DISMISS_ATTRIBUTE,
  MESSAGE_ATTRIBUTE,
  ROOT_ATTRIBUTE,
  TEXT_PROPERTY
} from './settings';

function createMessage(config: BarConfig): HTMLElement {
  const message = document.createElement('p');
  message.setAttribute(MESSAGE_ATTRIBUTE, '');
  if (config.linkUrl === undefined) {
    message.textContent = config.message;
    return message;
  }
  const link = document.createElement('a');
  link.href = config.linkUrl;
  link.textContent = config.message;
  message.appendChild(link);
  return message;
}

function createCountdown(endsAtMs: number): HTMLTimeElement {
  const time = document.createElement('time');
  time.setAttribute(COUNTDOWN_ATTRIBUTE, '');
  const wholeSecondsIso = new Date(toEpochSeconds(endsAtMs) * 1000).toISOString().slice(0, 19);
  time.dateTime = `${wholeSecondsIso}Z`;
  return time;
}

function createDismissButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(DISMISS_ATTRIBUTE, '');
  button.setAttribute('aria-label', DEFAULT_LABELS.dismiss);
  button.textContent = '×';
  return button;
}

function applySettingAttributes(root: HTMLElement, config: BarConfig): void {
  for (const [setting, value] of Object.entries(toRawSettings(config))) {
    if (value !== undefined) root.setAttribute(dataAttributeFor(setting as SettingName), value);
  }
}

function applyColors(root: HTMLElement, config: BarConfig): void {
  if (config.backgroundColor !== undefined) {
    root.style.setProperty(BACKGROUND_PROPERTY, config.backgroundColor);
  }
  if (config.textColor !== undefined) root.style.setProperty(TEXT_PROPERTY, config.textColor);
}

/**
 * Builds the bar markup. The Liquid template must produce the same structure.
 * All text is set via `textContent`, never parsed as HTML.
 */
export function buildBar(config: BarConfig): HTMLElement {
  const root = document.createElement('aside');
  root.setAttribute(ROOT_ATTRIBUTE, '');
  root.setAttribute('aria-label', DEFAULT_LABELS.region);
  applySettingAttributes(root, config);
  applyColors(root, config);

  root.appendChild(createMessage(config));
  if (config.endsAtMs !== undefined) root.appendChild(createCountdown(config.endsAtMs));
  if (config.dismissible) root.appendChild(createDismissButton());
  return root;
}
