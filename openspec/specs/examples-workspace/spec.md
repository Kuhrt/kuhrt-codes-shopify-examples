# examples-workspace Specification

## Purpose

The repository-level contract every Shopify sample app in this monorepo inherits: one quality gate, CI enforcement, a pinned toolchain, and secret hygiene, so each app is consistent and safe to publish.

## Requirements

### Requirement: Single quality gate
The repository SHALL provide one root command that checks formatting, lint, type checking, and tests for every workspace package and app. It SHALL exit non-zero if any check fails.

#### Scenario: All checks pass
- **WHEN** a developer runs the root quality gate on a clean checkout with no violations
- **THEN** the command exits zero after running format, lint, typecheck, and test for every workspace

#### Scenario: One app fails a check
- **WHEN** any single workspace has a lint error, type error, failing test, or unformatted file
- **THEN** the root quality gate exits non-zero and names the failing workspace and check

#### Scenario: New app joins the gate automatically
- **WHEN** a new app is added under `apps/` with standard `lint`, `typecheck`, and `test` scripts
- **THEN** the root quality gate includes it without editing any root configuration

### Requirement: CI enforces the quality gate
CI SHALL run the same quality gate on every pull request and on every push to `main`. A failing gate SHALL fail the run.

#### Scenario: Pull request with a failing test
- **WHEN** a pull request introduces a failing test in any app
- **THEN** the CI run for that pull request fails

### Requirement: Pinned toolchain
The repository SHALL declare the Node.js major version and the exact package manager version. The CI SHALL use the declared versions.

#### Scenario: CI uses the declared Node version
- **WHEN** CI runs
- **THEN** it installs the Node.js version declared by the repository, not a runner default

#### Scenario: Wrong package manager
- **WHEN** a developer installs dependencies with a package manager version other than the declared one
- **THEN** installation is refused or warns, naming the declared version

### Requirement: Secrets are never committed
Local credential files SHALL be ignored by version control: environment files, Worker dev vars, and Shopify CLI local state. CI SHALL fail when a commit contains a credential pattern.

#### Scenario: Local env file is ignored
- **WHEN** a developer creates `.env` or `.dev.vars` in any app
- **THEN** version control reports the file as ignored

#### Scenario: Credential committed by mistake
- **WHEN** a pushed commit contains a string matching a Shopify access token or API secret pattern
- **THEN** the CI secret scan fails and identifies the file and line

### Requirement: Examples index
The repository root SHALL have a README that lists every sample app with a one-sentence summary and a link to that app's own README.

#### Scenario: App listed in the index
- **WHEN** an app exists under `apps/`
- **THEN** the root README links to that app's README
