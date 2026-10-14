# wholesale-discount-guide Specification

## Purpose
The written and reproducible parts of the wholesale discount sample: a README that meets the portfolio template and explains what the app replaces and where it can run, and a demo setup that recreates the recorded demo on any development store.

## Requirements

### Requirement: README follows the portfolio template
The app README SHALL contain, in order:
- the one-sentence problem;
- a 30–60 second GIF or video;
- the Shopify features shown;
- an architecture diagram;
- run-locally steps of 5 commands or fewer;
- the access scopes and why each is needed;
- the "Need something like this built?" link to shopify.kuhrt.codes/work-with-me.

#### Scenario: Template sections present
- **WHEN** a reader opens the app README
- **THEN** every section listed above is present, in that order

#### Scenario: Run-locally steps work
- **WHEN** a developer with a Partner account follows the run-locally steps on a fresh clone
- **THEN** the app runs on their development store in 5 commands or fewer

### Requirement: README explains what replaces a Shopify Script
The README SHALL explain, in at most five lines of prose, how this Function replaces an equivalent Shopify Script. It SHALL state that Scripts no longer run, and contrast how a Script changed line prices directly with how a Function returns discounts for Shopify to apply. It SHALL also note Rust as the option for performance-sensitive Functions.

#### Scenario: Script comparison
- **WHEN** a reader who used Shopify Scripts reads the README
- **THEN** a section of five lines or fewer explains how the same wholesale pricing works as a Function, with no Ruby code required to follow it

### Requirement: README states where the app can run
The README SHALL state that this custom, extension-only app runs on Shopify Plus and development stores. It SHALL state that a non-Plus merchant needs a public app, which requires a hosted backend, and point to App 1 as an example of that shape.

#### Scenario: Non-Plus merchant
- **WHEN** a non-Plus merchant reads the README
- **THEN** it tells them this build can't be installed as-is on their store, and what would be needed instead

### Requirement: README states when the discount applies
The README SHALL state that the discount applies only to logged-in customers who carry the configured tag. It SHALL state that quantity is counted per product across variants, that the highest qualifying tier applies, and that combining with other discounts is set in Shopify's discount settings.

#### Scenario: Guest checkout question
- **WHEN** a reader wonders why a guest checkout gets no wholesale price
- **THEN** the README answers it

### Requirement: Scope table matches the app configuration
The README's access-scopes table SHALL list exactly the scopes the app configuration requests, each with its reason. An automated test SHALL fail when they differ.

#### Scenario: Scope added without documentation
- **WHEN** a scope is added to the app configuration but not to the README table
- **THEN** the quality gate fails, naming the mismatch

### Requirement: Demo setup is reproducible
A documented demo setup command SHALL create, on the store it is given, a small set of products with variants and one customer tagged `wholesale`. Running it again SHALL NOT create duplicates. It SHALL refuse to run without an explicitly named store.

#### Scenario: First run
- **WHEN** the setup runs against a development store with none of its data
- **THEN** the demo products and the tagged customer exist afterwards

#### Scenario: Second run
- **WHEN** the setup runs again against the same store
- **THEN** no product or customer is duplicated

#### Scenario: No store named
- **WHEN** the setup is run without a store argument
- **THEN** it exits non-zero without contacting any store
