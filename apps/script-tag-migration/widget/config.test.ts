import { describe, expect, it } from 'vitest';

import { parseConfig } from './config';
import type { SettingName } from './settings';
import { ENDED_BEHAVIOR, SETTING } from './settings';

const VALID_MESSAGE = { [SETTING.message]: 'Sale' };

function settingsWarned(raw: Record<string, string | undefined>): SettingName[] {
  return parseConfig(raw).warnings.map((warning) => warning.setting);
}

describe('parseConfig', () => {
  describe('message', () => {
    it('is trimmed', () => {
      expect(parseConfig({ [SETTING.message]: '  Sale  ' }).config?.message).toBe('Sale');
    });

    it.each([undefined, '', '   ', '\n\t'])(
      'renders nothing for %j, without a warning',
      (message) => {
        expect(parseConfig({ [SETTING.message]: message })).toEqual({ config: null, warnings: [] });
      }
    );

    it('applies defaults when only a message is given', () => {
      expect(parseConfig(VALID_MESSAGE)).toEqual({
        config: { message: 'Sale', ended: { behavior: ENDED_BEHAVIOR.hide }, dismissible: false },
        warnings: []
      });
    });

    it('ignores unknown keys silently', () => {
      const result = parseConfig({ ...VALID_MESSAGE, utm_source: 'x', Message: 'y' });
      expect(result.warnings).toEqual([]);
      expect(result.config?.message).toBe('Sale');
    });
  });

  describe('link_url', () => {
    it.each(['https://example.com/a?b=1', 'http://example.com', '/collections/sale', '/'])(
      'accepts %s',
      (url) => {
        const result = parseConfig({ ...VALID_MESSAGE, [SETTING.linkUrl]: url });
        expect(result.config?.linkUrl).toBe(url);
        expect(result.warnings).toEqual([]);
      }
    );

    it('trims the URL', () => {
      expect(parseConfig({ ...VALID_MESSAGE, [SETTING.linkUrl]: ' /sale ' }).config?.linkUrl).toBe(
        '/sale'
      );
    });

    it.each([
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>1</script>',
      'vbscript:x',
      'ftp://example.com',
      '//evil.com',
      '/\\evil.com',
      'sale',
      'not a url',
      'https://'
    ])('rejects %j with one warning and no link', (url) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.linkUrl]: url });
      expect(result.config?.linkUrl).toBeUndefined();
      expect(result.config?.message).toBe('Sale');
      expect(result.warnings.map((warning) => warning.setting)).toEqual([SETTING.linkUrl]);
    });

    it.each([undefined, '', '  '])('treats %j as no link without a warning', (url) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.linkUrl]: url });
      expect(result.config?.linkUrl).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });
  });

  describe('ends_at', () => {
    const EPOCH_SECONDS = 1_800_000_000;

    it('accepts epoch seconds and normalizes to milliseconds', () => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: String(EPOCH_SECONDS) });
      expect(result.config?.endsAtMs).toBe(EPOCH_SECONDS * 1000);
      expect(result.warnings).toEqual([]);
    });

    it.each([
      '2027-01-15T08:00:00Z',
      '2027-01-15T03:00:00-05:00',
      '2027-01-15T09:00:00+01:00',
      '2027-01-15T09:00:00+0100'
    ])('accepts ISO 8601 with an explicit offset: %s', (iso) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: iso });
      expect(result.config?.endsAtMs).toBe(Date.UTC(2027, 0, 15, 8));
      expect(result.warnings).toEqual([]);
    });

    it('accepts ISO 8601 without seconds', () => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: '2027-01-15T08:00Z' });
      expect(result.config?.endsAtMs).toBe(Date.UTC(2027, 0, 15, 8));
    });

    it('drops sub-second precision so every input path yields the same value', () => {
      const result = parseConfig({
        ...VALID_MESSAGE,
        [SETTING.endsAt]: '2027-01-15T08:00:00.987Z'
      });
      expect(result.config?.endsAtMs).toBe(Date.UTC(2027, 0, 15, 8));
    });

    it('treats epoch zero as a valid end time', () => {
      expect(parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: '0' }).config?.endsAtMs).toBe(0);
    });

    it.each([
      '2027-01-15T08:00:00',
      '2027-01-15',
      '2027-01-15 08:00',
      'next tuesday',
      '-5',
      '1.5',
      '12abc',
      '2027-13-45T99:00:00Z',
      '99999999999999999999'
    ])('treats %j as no end time with one warning', (value) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: value });
      expect(result.config?.endsAtMs).toBeUndefined();
      expect(result.config?.message).toBe('Sale');
      expect(result.warnings.map((warning) => warning.setting)).toEqual([SETTING.endsAt]);
    });

    it.each([undefined, '', ' '])('treats %j as no end time without a warning', (value) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: value });
      expect(result.config?.endsAtMs).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });
  });

  describe('ended_behavior and ended_message', () => {
    it('defaults to hide', () => {
      expect(parseConfig(VALID_MESSAGE).config?.ended).toEqual({ behavior: ENDED_BEHAVIOR.hide });
    });

    it('accepts hide', () => {
      const result = parseConfig({
        ...VALID_MESSAGE,
        [SETTING.endedBehavior]: ENDED_BEHAVIOR.hide
      });
      expect(result.config?.ended).toEqual({ behavior: ENDED_BEHAVIOR.hide });
      expect(result.warnings).toEqual([]);
    });

    it('accepts message with a trimmed ended message', () => {
      const result = parseConfig({
        ...VALID_MESSAGE,
        [SETTING.endedBehavior]: ENDED_BEHAVIOR.message,
        [SETTING.endedMessage]: '  Over  '
      });
      expect(result.config?.ended).toEqual({ behavior: ENDED_BEHAVIOR.message, message: 'Over' });
      expect(result.warnings).toEqual([]);
    });

    it('ignores an ended message when the behavior is hide', () => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endedMessage]: 'Over' });
      expect(result.config?.ended).toEqual({ behavior: ENDED_BEHAVIOR.hide });
      expect(result.warnings).toEqual([]);
    });

    it.each(['HIDE', 'show', 'remove', 'true'])(
      'falls back to hide with one warning for behavior %j',
      (value) => {
        const result = parseConfig({ ...VALID_MESSAGE, [SETTING.endedBehavior]: value });
        expect(result.config?.ended).toEqual({ behavior: ENDED_BEHAVIOR.hide });
        expect(result.warnings.map((warning) => warning.setting)).toEqual([SETTING.endedBehavior]);
      }
    );

    it.each([undefined, '', '   '])(
      'falls back to hide with one warning when behavior is message and the ended message is %j',
      (ended) => {
        const result = parseConfig({
          ...VALID_MESSAGE,
          [SETTING.endedBehavior]: ENDED_BEHAVIOR.message,
          [SETTING.endedMessage]: ended
        });
        expect(result.config?.ended).toEqual({ behavior: ENDED_BEHAVIOR.hide });
        expect(result.warnings.map((warning) => warning.setting)).toEqual([SETTING.endedMessage]);
      }
    );
  });

  describe('dismissible', () => {
    it.each(['true', 'TRUE', '1', ' true '])('reads %j as true', (value) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.dismissible]: value });
      expect(result.config?.dismissible).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it.each(['false', 'False', '0'])('reads %j as false', (value) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.dismissible]: value });
      expect(result.config?.dismissible).toBe(false);
      expect(result.warnings).toEqual([]);
    });

    it.each([undefined, ''])('defaults %j to false without a warning', (value) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.dismissible]: value });
      expect(result.config?.dismissible).toBe(false);
      expect(result.warnings).toEqual([]);
    });

    it.each(['yes', 'on', '2', 'null'])('defaults %j to false with one warning', (value) => {
      const result = parseConfig({ ...VALID_MESSAGE, [SETTING.dismissible]: value });
      expect(result.config?.dismissible).toBe(false);
      expect(result.warnings.map((warning) => warning.setting)).toEqual([SETTING.dismissible]);
    });
  });

  describe.each([
    ['backgroundColor', SETTING.backgroundColor],
    ['textColor', SETTING.textColor]
  ] as const)('%s', (property, setting) => {
    it.each(['#fff', '#FFFFFF', '#1a2B3c', ' #000 '])('accepts %j', (color) => {
      const result = parseConfig({ ...VALID_MESSAGE, [setting]: color });
      expect(result.config?.[property]).toBe(color.trim());
      expect(result.warnings).toEqual([]);
    });

    it.each([
      'red',
      'fff',
      '#ff',
      '#ffff',
      '#fffffff',
      '#ggg',
      'rgb(0,0,0)',
      'url(x)',
      '#fff; color: red'
    ])('omits %j with one warning', (color) => {
      const result = parseConfig({ ...VALID_MESSAGE, [setting]: color });
      expect(result.config?.[property]).toBeUndefined();
      expect(result.warnings.map((warning) => warning.setting)).toEqual([setting]);
    });

    it('omits an absent color without a warning', () => {
      const result = parseConfig(VALID_MESSAGE);
      expect(result.config?.[property]).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });
  });

  describe('warnings', () => {
    it('reports exactly one warning per invalid setting', () => {
      const warned = settingsWarned({
        ...VALID_MESSAGE,
        [SETTING.linkUrl]: 'javascript:1',
        [SETTING.endsAt]: 'soon',
        [SETTING.endedBehavior]: 'vanish',
        [SETTING.dismissible]: 'maybe',
        [SETTING.backgroundColor]: 'red',
        [SETTING.textColor]: 'blue'
      });
      expect([...warned].sort()).toEqual(
        [
          SETTING.linkUrl,
          SETTING.endsAt,
          SETTING.endedBehavior,
          SETTING.dismissible,
          SETTING.backgroundColor,
          SETTING.textColor
        ].sort()
      );
    });

    it('still reports invalid settings when the message is empty', () => {
      const result = parseConfig({ [SETTING.linkUrl]: 'javascript:1' });
      expect(result.config).toBeNull();
      expect(result.warnings.map((warning) => warning.setting)).toEqual([SETTING.linkUrl]);
    });

    it('gives every warning a reason', () => {
      const [warning] = parseConfig({ ...VALID_MESSAGE, [SETTING.endsAt]: 'soon' }).warnings;
      expect(warning?.reason).toBeTruthy();
    });
  });

  it('parses a fully specified configuration', () => {
    expect(
      parseConfig({
        [SETTING.message]: 'Sale',
        [SETTING.linkUrl]: '/sale',
        [SETTING.endsAt]: '1800000000',
        [SETTING.endedBehavior]: ENDED_BEHAVIOR.message,
        [SETTING.endedMessage]: 'Over',
        [SETTING.dismissible]: 'true',
        [SETTING.backgroundColor]: '#000',
        [SETTING.textColor]: '#fff'
      })
    ).toEqual({
      config: {
        message: 'Sale',
        linkUrl: '/sale',
        endsAtMs: 1_800_000_000_000,
        ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' },
        dismissible: true,
        backgroundColor: '#000',
        textColor: '#fff'
      },
      warnings: []
    });
  });
});
