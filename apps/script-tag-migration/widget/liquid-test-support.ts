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
const EPOCH_FORMAT = '%s';
const ASSET_BASE_URL = 'https://cdn.example/assets/';
const ISO_OFFSET_FORMAT = '%Y-%m-%dT%H:%M:%S%z';
const STORE_OFFSET = '-05:00';
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
  /** The wall-clock time as ISO 8601 without an offset. */
  iso: string;
  /** Epoch seconds, reading the wall-clock time in the store time zone. */
  epochSeconds: number;
}

/** Reads `YYYY-MM-DD HH:MM`, the shape of a merchant-entered end time, in the fixed store time zone (UTC-05:00). */
export function parseLocalDateTime(input: string): LocalDateTime | undefined {
  const match = LOCAL_DATE_TIME.exec(input);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const epochSeconds = Date.parse(`${iso}${STORE_OFFSET}`) / 1000;
  return Number.isNaN(epochSeconds) ? undefined : { iso, epochSeconds };
}

/**
 * Stands in for Shopify's `date` filter with the store time zone fixed to UTC-05:00.
 * Understands inputs shaped `YYYY-MM-DD HH:MM` and the `%s` and `%Y-%m-%dT%H:%M:%S%z` formats only.
 * Like Liquid, an input it cannot parse is returned unchanged.
 */
function stubDate(input: unknown, format: string): unknown {
  const parsed = parseLocalDateTime(String(input));
  if (!parsed) return input;
  if (format === EPOCH_FORMAT) return String(parsed.epochSeconds);
  if (format === ISO_OFFSET_FORMAT) return `${parsed.iso}${STORE_OFFSET_WITHOUT_COLON}`;
  throw new Error(`Unsupported date format: ${format}`);
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
