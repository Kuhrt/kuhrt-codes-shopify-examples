import { describe, expect, it } from 'vitest';

import {
  COUNTDOWN_ATTRIBUTE,
  dataAttributeFor,
  DISMISS_ATTRIBUTE,
  ENDED_ATTRIBUTE,
  MESSAGE_ATTRIBUTE,
  ROOT_ATTRIBUTE,
  SETTING
} from './settings';

describe('data attributes', () => {
  it('keeps structural markers distinct from setting attributes', () => {
    const structural = [
      ROOT_ATTRIBUTE,
      MESSAGE_ATTRIBUTE,
      COUNTDOWN_ATTRIBUTE,
      DISMISS_ATTRIBUTE,
      ENDED_ATTRIBUTE
    ];
    const settings = Object.values(SETTING).map(dataAttributeFor);

    expect(structural.filter((name) => settings.includes(name))).toEqual([]);
  });
});
