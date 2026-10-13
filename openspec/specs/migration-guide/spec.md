# migration-guide Specification

## Purpose

The written deliverables that turn the sample into a sales asset: a migration guide that a merchant or agency can follow (and hire out), and a README that meets the portfolio template.

## Requirements

### Requirement: Guide covers the full migration sequence
`MIGRATION.md` SHALL cover, in order:
- auditing existing script tags;
- mapping script behavior to an app embed (or a web pixel, for analytics-only scripts);
- shipping the embed;
- getting merchants to enable it (deep links and onboarding nudges, since there is no API to enable it);
- verifying it is live;
- removing the old tags;
- rechecking after theme changes.

#### Scenario: Sequence present
- **WHEN** a reader opens `MIGRATION.md`
- **THEN** it has one section per step listed above, in that order, each with concrete commands, queries, or links

#### Scenario: Analytics-only scripts
- **WHEN** a reader's script only sends analytics and renders nothing
- **THEN** the guide directs them to web pixels instead of an app embed, and explains why

### Requirement: Guide maps old code to new code in this repo
The guide SHALL show the legacy and modern implementations side by side for each concern: injection, configuration, rendering, and removal. Each SHALL be linked to the file in this repository that implements it.

#### Scenario: Side-by-side mapping
- **WHEN** a reader looks up how configuration moved
- **THEN** the guide shows the legacy query-string configuration and the theme editor settings next to each other, linking to both source files

### Requirement: Guide states platform dates and verified facts with sources
The guide SHALL state the script tag milestone dates and the verified creation-block response. Each platform claim SHALL link to its shopify.dev source.

#### Scenario: Dates cited
- **WHEN** a reader checks a deadline in the guide
- **THEN** the date is accompanied by a link to the shopify.dev page that states it

### Requirement: Guide ends with a hire-me path
The guide SHALL end with a short section offering the migration as a service, linking to the work-with-me page and to the store checker.

#### Scenario: Call to action present
- **WHEN** a reader reaches the end of `MIGRATION.md`
- **THEN** there are links to `shopify.kuhrt.codes/work-with-me` and to the store checker

### Requirement: README follows the portfolio template
The app README SHALL contain the portfolio template sections:
- problem statement;
- demo GIF or video;
- Shopify features shown;
- architecture diagram;
- run locally in five commands or fewer;
- scopes and why;
- the work-with-me link.

#### Scenario: Template sections present
- **WHEN** the README is reviewed against the template
- **THEN** every section is present, and the run-locally block has five or fewer commands

#### Scenario: Run-locally commands work
- **WHEN** a developer with the stated prerequisites runs the run-locally commands from a fresh clone against their own development store
- **THEN** the app runs and the embed can be enabled on that store
