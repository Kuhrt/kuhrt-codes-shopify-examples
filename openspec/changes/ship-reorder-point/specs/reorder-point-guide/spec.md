# Spec Delta

## Purpose

The written deliverable of the reorder point sample: a README that meets the portfolio template, states the forecast's formula and limits, explains its relationship to Restock Mate and where it can be installed, and keeps its scope table in step with the app configuration.

## ADDED Requirements

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

### Requirement: README states the formula
The README SHALL state how each figure in the block is computed, including:
- the two windows;
- which average drives the forecast;
- the reorder point formula;
- the status thresholds;
- the setting defaults.

A reader SHALL be able to reproduce the block's reorder point for a product from the figures the block shows.

#### Scenario: Checking a number
- **WHEN** a reader takes a product's 30-day average, lead time and safety stock from the block
- **THEN** the README's formula gives the reorder point the block shows

### Requirement: README states the forecast's limits
The README SHALL state that the forecast:
- ignores incoming stock and purchase orders;
- has no seasonality or trend model beyond showing both averages;
- under-estimates a product launched inside a window until that window fills;
- applies settings per product, not per variant or location.

#### Scenario: New product question
- **WHEN** a reader wonders why a product launched last week shows a low average
- **THEN** the README answers it

### Requirement: README explains the Restock Mate relationship
The README SHALL name the parts of the calculation taken from Restock Mate, and state why this sample measures sales from orders rather than from inventory snapshots.

#### Scenario: Reviewer compares the two
- **WHEN** a reviewer who has seen Restock Mate reads the README
- **THEN** they can tell what is shared, what differs, and why

### Requirement: README states where the app can be installed
The README SHALL state the app's distribution method and which stores it can be installed on. It SHALL state what a public listing would additionally require.

#### Scenario: Merchant asks to install it
- **WHEN** a merchant reads the README
- **THEN** it tells them whether this build can be installed on their store, and what would be needed otherwise

### Requirement: Scope table matches the app configuration
The README's access-scopes table SHALL list exactly the scopes the app configuration requests, each with its reason. An automated test SHALL fail when they differ.

#### Scenario: Scope added without documentation
- **WHEN** a scope is added to the app configuration but not to the README table
- **THEN** the quality gate fails, naming the mismatch
