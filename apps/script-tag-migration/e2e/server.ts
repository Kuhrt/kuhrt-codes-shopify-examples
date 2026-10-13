import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGACY_SCRIPT_PATH } from '../legacy/settings-url';
import type { BlockSettings } from '../widget/liquid-test-support';
import { extensionPath, renderBlock } from '../widget/liquid-test-support';
import { SETTING } from '../widget/settings';
import {
  DOUBLE_PATH,
  EMBED_PATH,
  EMBED_SCRIPT_PATH,
  EMBED_STYLESHEET_PATH,
  HEALTH_PATH,
  HOST,
  LEGACY_PATH,
  LEGACY_STYLESHEET_PATH,
  PAGE_LINK_ID,
  PORT
} from './routes';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JAVASCRIPT = 'text/javascript; charset=utf-8';
const CSS = 'text/css; charset=utf-8';
const HTML = 'text/html; charset=utf-8';
const NEWLINE = '\n';
const LEGACY_MESSAGE_SUFFIX = 'from the legacy script';

interface StaticFile {
  path: string;
  contentType: string;
}

const STATIC_FILES = new Map<string, StaticFile>([
  [
    EMBED_SCRIPT_PATH,
    { path: extensionPath('assets/announcement-bar.js'), contentType: JAVASCRIPT }
  ],
  [EMBED_STYLESHEET_PATH, { path: extensionPath('assets/announcement-bar.css'), contentType: CSS }],
  [
    LEGACY_SCRIPT_PATH,
    { path: resolve(APP_ROOT, 'public/legacy/announcement-bar.js'), contentType: JAVASCRIPT }
  ],
  [
    LEGACY_STYLESHEET_PATH,
    { path: resolve(APP_ROOT, 'public/legacy/announcement-bar.css'), contentType: CSS }
  ]
]);

function assertStaticFilesExist(): void {
  const missing = [...STATIC_FILES.values()].filter(({ path }) => !existsSync(path));
  if (missing.length === 0) return;
  const paths = missing.map(({ path }) => path).join(NEWLINE);
  console.error(
    `E2E harness cannot start; run "pnpm build:widget" first. Missing files:${NEWLINE}${paths}`
  );
  process.exit(1);
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function blockSettingsFrom(params: URLSearchParams): BlockSettings {
  const settings: BlockSettings = {};
  for (const id of Object.values(SETTING)) {
    const value = params.get(id);
    if (value === null) continue;
    settings[id] = id === SETTING.dismissible ? value === 'true' : value;
  }
  return settings;
}

/** The embed's `<script async>` in `<head>`, as Shopify injects an app embed's asset. */
const EMBED_SCRIPT_TAG = `<script async src="${EMBED_SCRIPT_PATH}"></script>`;

/** A `<script defer>` in `<head>`, as a script tag loads the legacy bundle; its settings are the query string. */
function legacyScriptTag(query: string): string {
  return `<script defer src="${escapeAttribute(`${LEGACY_SCRIPT_PATH}?${query}`)}"></script>`;
}

function renderPage({
  headScripts,
  blockHtml = ''
}: {
  headScripts: string[];
  blockHtml?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Storefront</title>
    ${headScripts.join('\n    ')}
  </head>
  <body>
    <main>
      <h1>Storefront</h1>
      <p>Page content that must not move when the bar appears.</p>
      <a id="${PAGE_LINK_ID}" href="#${PAGE_LINK_ID}">Page link</a>
    </main>
    ${blockHtml}
  </body>
</html>`;
}

function embedBlock(params: URLSearchParams): string {
  return renderBlock(blockSettingsFrom(params), { assetBaseUrl: '/assets/' });
}

/** The settings for the double-load page's legacy script: the same campaign under a different message. */
function withLegacyMessage(params: URLSearchParams): URLSearchParams {
  const legacy = new URLSearchParams(params);
  legacy.set(SETTING.message, `${params.get(SETTING.message) ?? ''} ${LEGACY_MESSAGE_SUFFIX}`);
  return legacy;
}

function pageFor(pathname: string, params: URLSearchParams): string | undefined {
  switch (pathname) {
    case EMBED_PATH:
      return renderPage({ headScripts: [EMBED_SCRIPT_TAG], blockHtml: embedBlock(params) });
    case LEGACY_PATH:
      return renderPage({ headScripts: [legacyScriptTag(params.toString())] });
    case DOUBLE_PATH:
      return renderPage({
        headScripts: [EMBED_SCRIPT_TAG, legacyScriptTag(withLegacyMessage(params).toString())],
        blockHtml: embedBlock(params)
      });
    default:
      return undefined;
  }
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer
): void {
  response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, message: string): void {
  send(response, status, 'text/plain; charset=utf-8', message);
}

function handle(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== 'GET') return sendText(response, 405, 'Method not allowed');
  const url = new URL(request.url ?? '/', `http://${HOST}`);
  if (url.pathname === HEALTH_PATH) return sendText(response, 200, 'ok');
  const file = STATIC_FILES.get(url.pathname);
  if (file) return send(response, 200, file.contentType, readFileSync(file.path));
  const page = pageFor(url.pathname, url.searchParams);
  if (page === undefined) return sendText(response, 404, 'Not found');
  send(response, 200, HTML, page);
}

function handleSafely(request: IncomingMessage, response: ServerResponse): void {
  try {
    handle(request, response);
  } catch (error: unknown) {
    console.error(error);
    sendText(response, 500, 'Server error');
  }
}

assertStaticFilesExist();

createServer(handleSafely).listen(PORT, HOST, () => {
  console.log(`E2E harness listening on http://${HOST}:${PORT}`);
});
