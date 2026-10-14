import { readdirSync } from 'node:fs';

const SCOPES_HEADING = '## Access scopes';

function sorted(values: string[]): string[] {
  return [...values].sort();
}

export function scopesFromToml(scopes: string): string[] {
  return sorted(
    scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

export function scopesFromReadme(readme: string): string[] {
  const start = readme.indexOf(SCOPES_HEADING);
  if (start === -1) throw new Error(`README has no "${SCOPES_HEADING}" section`);

  const [section = ''] = readme.slice(start + SCOPES_HEADING.length).split(/^## /m);
  const rows = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => (line.split('|')[1] ?? '').trim())
    .filter((cell) => !/^-+$/.test(cell));

  return sorted(rows.slice(1).map((cell) => cell.replaceAll('`', '')));
}

export function appConfigFiles(appRoot: string): string[] {
  return readdirSync(appRoot).filter((name) => /^shopify\.app(\..+)?\.toml$/.test(name));
}
