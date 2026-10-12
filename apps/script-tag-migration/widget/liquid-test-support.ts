import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TagToken, TopLevelToken } from 'liquidjs';
import { Liquid, Tag } from 'liquidjs';

const EXTENSION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../extensions/announcement-bar'
);

export function extensionPath(relativePath: string): string {
  return resolve(EXTENSION_DIR, relativePath);
}

const SCHEMA_BLOCK = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const EPOCH_SECONDS = /^\d+$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EPOCH_FORMAT = '%s';
const LOCAL_FORMAT = '%Y-%m-%d %H:%M';
const ASSET_BASE_URL = 'https://cdn.example/assets/';
const ISO_OFFSET_FORMAT = '%Y-%m-%dT%H:%M:%S%z';
const STORE_OFFSET = '-05:00';
const STORE_OFFSET_MS = 5 * 60 * 60 * 1000;
const STORE_OFFSET_WITHOUT_COLON = STORE_OFFSET.replace(':', '');

export interface BlockSchema {
  target: string;
  javascript: string;
  settings: { id: string; type: string }[];
}

export type BlockSettings = Record<string, string | boolean | null | undefined>;

function readExtensionFile(path: string): string {
  return readFileSync(extensionPath(path), 'utf8');
}

function readBlockSource(): string {
  return readExtensionFile('blocks/announcement-bar.liquid');
}

export function readBlockSchema(): BlockSchema {
  const match = SCHEMA_BLOCK.exec(readBlockSource());
  if (!match?.[1]) throw new Error('The block has no {% schema %} section');
  return JSON.parse(match[1]) as BlockSchema;
}

function lookupTranslation(key: string): string {
  let node: unknown = JSON.parse(readExtensionFile('locales/en.default.json'));
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) {
      throw new Error(`Missing translation key: ${key}`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') throw new Error(`Translation key is not a string: ${key}`);
  return node;
}

export interface LocalDateTime {
  /** The wall-clock time as ISO 8601 without an offset, exactly as written. */
  iso: string;
  /** `iso` with the store offset. `parseConfig` accepts it only when the date is real. */
  isoWithOffset: string;
  /** Epoch seconds. An out-of-range day or month rolls over, as in Ruby and V8. */
  epochSeconds: number;
}

/** Reads `YYYY-MM-DD HH:MM`, the shape of a merchant-entered end time, in the fixed store time zone (UTC-05:00). */
export function parseLocalDateTime(input: string): LocalDateTime | undefined {
  const match = LOCAL_DATE_TIME.exec(input);
  if (!match) return undefined;
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = match.slice(1).map(Number);
  const iso = `${input.slice(0, 10)}T${input.slice(11)}:00`;
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute);
  return {
    iso,
    isoWithOffset: `${iso}${STORE_OFFSET}`,
    epochSeconds: (wallClockMs + STORE_OFFSET_MS) / 1000
  };
}

function formatEpoch(epochSeconds: number, format: string): string {
  if (format === EPOCH_FORMAT) return String(epochSeconds);
  const wallClock = new Date(epochSeconds * 1000 - STORE_OFFSET_MS).toISOString();
  const [date = '', time = ''] = wallClock.slice(0, 19).split('T');
  if (format === LOCAL_FORMAT) return `${date} ${time.slice(0, 5)}`;
  if (format === ISO_OFFSET_FORMAT) return `${date}T${time}${STORE_OFFSET_WITHOUT_COLON}`;
  throw new Error(`Unsupported date format: ${format}`);
}

/**
 * Stands in for Shopify's `date` filter with the store time zone fixed to UTC-05:00.
 * An all-digit input is epoch seconds and `YYYY-MM-DD HH:MM` is a store-local time, where
 * an out-of-range day or month rolls over. `YYYY-MM-DD` is store-local midnight. Any other
 * input is returned unchanged, as Liquid does.
 * Formats: `%s`, `%Y-%m-%d %H:%M` and `%Y-%m-%dT%H:%M:%S%z`.
 */
function stubDate(input: unknown, format: string): unknown {
  const text = String(input);
  const epochSeconds = EPOCH_SECONDS.test(text)
    ? Number(text)
    : parseLocalDateTime(LOCAL_DATE.test(text) ? `${text} 00:00` : text)?.epochSeconds;
  return epochSeconds === undefined ? input : formatEpoch(epochSeconds, format);
}

/** Consumes everything up to `endschema` and renders nothing. */
class SchemaTag extends Tag {
  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid);
    const stream = liquid.parser.parseStream(remainTokens);
    stream
      .on('token', (token) => {
        if (token && 'name' in token && token.name === 'endschema') stream.stop();
      })
      .on('end', () => {
        throw new Error('{% schema %} is not closed');
      });
    stream.start();
  }

  render(): string {
    return '';
  }
}

function createEngine(): Liquid {
  const engine = new Liquid();
  engine.registerTag('schema', SchemaTag);
  engine.registerFilter('t', lookupTranslation);
  engine.registerFilter('date', stubDate);
  engine.registerFilter('asset_url', (filename: string) => `${ASSET_BASE_URL}${filename}`);
  engine.registerFilter('stylesheet_tag', (url: string) => `<link rel="stylesheet" href="${url}">`);
  return engine;
}

export function renderBlock(settings: BlockSettings): string {
  return createEngine().parseAndRenderSync(readBlockSource(), { block: { settings } });
}
