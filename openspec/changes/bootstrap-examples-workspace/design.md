# Design

## Context

See proposal.md, "Why". The website repo (`kuhrt-codes-shopify`) already runs on a pnpm/Turborepo monorepo with `@repo/config`, Prettier, ESLint 10, Vitest, and a GitHub Actions CI. This workspace copies those conventions so moving between the two repos costs nothing. It does not share code with the website repo: the two have different deploy targets and audiences, and a cross-repo dependency would couple them for no gain.

## Goals / Non-Goals

**Goals:**
- A reviewer opening the repo sees one obvious layout: `apps/<app>/` is a complete Shopify app, and `packages/` holds only what is genuinely shared.
- Adding App 2 or App 3 needs no root config changes.

**Non-Goals:**
- The seed script. It lands in its own change, as `packages/seed`, when App 3 needs seeded order history. App 1 does not depend on seed data.
- Deployment. Each app owns its own deploy (App 1: Cloudflare Workers plus `shopify app deploy`), so this change only covers checks.
- Releasing any package to npm.

## Decisions

### 1. One monorepo for all sample apps, not one repo per app

- The spec allows either. A monorepo wins:
  - The seed script is shared by App 3 and the Restock Mate video.
  - The toolchain and CI are written once.
  - One pinned GitHub repo covers the whole portfolio. Profiles allow only six pins.
- Each app still stands alone. It has its own `shopify.app.toml` and README, and its own install/run instructions, which work from `apps/<app>/`. The site's `/examples` entries link straight to the app folder (`.../tree/main/apps/<app>`).
- **Alternative considered:** one repo per app. It gives cleaner per-app star counts and URLs, but it means three copies of tooling and CI, plus a seed script that has to be published or copied. Rejected.

### 2. Mirror the website repo's toolchain exactly

- Same Node major, the exact pnpm version, the same TypeScript, ESLint and Prettier majors and style rules, and the same `@repo/config` package shape.
- The Prettier config drops `prettier-plugin-tailwindcss`. No app here uses Tailwind: Shopify admin UI uses Polaris, and the storefront uses theme CSS.
- Shopify's React Router app template pins its own React and React Router versions. Apps keep the template's versions instead of forcing the website's React 19, because fighting the template makes the sample harder to follow. Record the template's versions in each app's design.md.

### 3. Turbo pipeline: `build`, `lint`, `typecheck`, `test`; root `check` wraps them

- `pnpm check` = `prettier --check . && turbo build lint typecheck test`. CI runs exactly `pnpm check`, so local and CI can't diverge.
- **Alternative considered:** separate CI jobs per check, as in the website repo. That parallelizes better, but the jobs here are tiny. Start with one job and split it only if CI time hurts.

### 4. Secret scanning with gitleaks in CI

- The `gitleaks/gitleaks-action` step runs on every push and pull request, using the default rules, which include Shopify token patterns (`shpat_`, `shpss_`, `shpca_`, `shppa_`).
- It needs no license for a personal public repo. Verify at implementation; if a license is required, fall back to running the `gitleaks` CLI binary directly.
- **Alternative considered:** rely on GitHub's built-in push protection alone. That is good, but invisible in the repo, and a visible CI step is part of what the portfolio shows. Keep both.

## Risks / Trade-offs

- [Template drift: Shopify's app template moves faster than the website's toolchain] → Apps pin the template's versions (decision 2). The shared ESLint preset must tolerate React 18 or 19.
- [Shopify CLI in a pnpm workspace: the CLI resolves its own package manager] → Verify `shopify app dev` from `apps/<app>` works with pnpm workspaces in App 1's spike task before relying on it.

## Migration Plan

Not applicable. This is a new repository.
