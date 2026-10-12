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
const ISO_OFFSET_FORMAT = '%Y-%m-%dT%H:%M:%S%z';

export interface BlockSchema {
  target: string;
  javascript: string;
  stylesheet: string;
  settings: { id: string; type: string }[];
}

export type BlockSettings = Record<string, string | boolean | undefined>;

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

/**
 * Stands in for Shopify's `date` filter with the store time zone fixed to UTC.
 * Understands inputs shaped `YYYY-MM-DD HH:MM` and the `%s` and `%Y-%m-%dT%H:%M:%S%z` formats only.
 * Like Liquid, an input it cannot parse is returned unchanged.
 */
function stubDate(input: unknown, format: string): unknown {
  const match = LOCAL_DATE_TIME.exec(String(input));
  if (!match) return input;
  const [, year, month, day, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00`;
  if (format === EPOCH_FORMAT) return String(Date.parse(`${iso}Z`) / 1000);
  if (format === ISO_OFFSET_FORMAT) return `${iso}+0000`;
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
  return engine;
}

export function renderBlock(settings: BlockSettings): string {
  return createEngine().parseAndRenderSync(readBlockSource(), { block: { settings } });
}
