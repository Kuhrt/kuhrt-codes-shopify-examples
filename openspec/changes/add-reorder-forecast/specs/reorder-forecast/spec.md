# Spec Delta

## Purpose

How the reorder point sample turns a product's sales history, stock and per-product settings into average daily sales, days until stockout, a suggested reorder point, and a stock status.

## ADDED Requirements

### Requirement: Average daily sales over fixed windows
Average daily sales SHALL be computed for two windows: the last 30 and the last 60 complete days before today, in the shop's timezone. Each average SHALL be the net units sold across all of the product's variants in the window, divided by the window's length in days. Days with no sales SHALL count as zero. A window whose net units sold are below zero (more returned than sold) SHALL average zero.

#### Scenario: Steady seller
- **WHEN** a product sold 3 units on each of the last 30 days
- **THEN** its 30-day average is 3 units per day

#### Scenario: Days without sales count
- **WHEN** a product sold 60 units, all on one day within the last 30 days
- **THEN** its 30-day average is 2 units per day

#### Scenario: Today is excluded
- **WHEN** a product has sales today and none in the previous 60 days
- **THEN** both averages are zero

#### Scenario: Returns reduce sales
- **WHEN** a product sold 40 units and had 10 returned within the last 30 days
- **THEN** its 30-day average is 1 unit per day

#### Scenario: More returned than sold
- **WHEN** a product's returns in a window exceed its sales in that window
- **THEN** that window's average is zero

### Requirement: Forecast uses the 30-day average
Days until stockout and the reorder point SHALL use the 30-day average. The 60-day average SHALL be shown for comparison and SHALL NOT change either value.

#### Scenario: Recent slowdown
- **WHEN** a product's 30-day average is 1 and its 60-day average is 4
- **THEN** days until stockout and the reorder point are computed from 1

### Requirement: Available stock is totalled across locations and variants
Available stock SHALL be the sum of the `available` quantity at every location, for every variant of the product whose inventory is tracked. Variants whose inventory is not tracked SHALL be excluded. When no variant is tracked, the product SHALL have no forecast.

#### Scenario: Two locations
- **WHEN** a product has 12 available at one location and 8 at another
- **THEN** its available stock is 20

#### Scenario: Untracked variant
- **WHEN** one of a product's variants does not track inventory
- **THEN** that variant contributes nothing to available stock

#### Scenario: Nothing tracked
- **WHEN** none of a product's variants track inventory
- **THEN** no days until stockout, reorder point or status is produced

### Requirement: Days until stockout
Days until stockout SHALL be the available stock divided by the 30-day average, rounded down to whole days. When available stock is zero or below, it SHALL be zero. When the 30-day average is zero, there SHALL be no estimate.

#### Scenario: Normal estimate
- **WHEN** available stock is 25 and the 30-day average is 3
- **THEN** days until stockout is 8

#### Scenario: Already out
- **WHEN** available stock is -2
- **THEN** days until stockout is 0

#### Scenario: No recent sales
- **WHEN** the 30-day average is zero and available stock is 50
- **THEN** there is no estimate

### Requirement: Suggested reorder point
The suggested reorder point SHALL be the 30-day average multiplied by the lead time in days, plus the safety stock, rounded up to a whole unit.

#### Scenario: With safety stock
- **WHEN** the 30-day average is 2.5, the lead time is 7 days and the safety stock is 10
- **THEN** the reorder point is 28

#### Scenario: No recent sales
- **WHEN** the 30-day average is zero and the safety stock is 5
- **THEN** the reorder point is 5

### Requirement: Stock status
Each product with a forecast SHALL have exactly one status, chosen in this order:
- **out of stock** when available stock is zero or below;
- **reorder now** when available stock is at or below the reorder point;
- **low** when available stock is at or below 1.5 times the reorder point;
- **healthy** otherwise.

#### Scenario: At the reorder point
- **WHEN** available stock equals the reorder point and is above zero
- **THEN** the status is reorder now

#### Scenario: Low
- **WHEN** the reorder point is 20 and available stock is 30
- **THEN** the status is low

#### Scenario: Healthy
- **WHEN** the reorder point is 20 and available stock is 31
- **THEN** the status is healthy

#### Scenario: Zero reorder point
- **WHEN** the reorder point is 0 and available stock is 1
- **THEN** the status is healthy

### Requirement: Per-product settings with defaults
Each product SHALL have two settings, editable by the merchant in the Shopify admin:
- lead time, in whole days from 0 to 365, defaulting to 7;
- safety stock, in whole units from 0 to 100,000, defaulting to 0.

A missing setting SHALL use its default. A setting that is present but invalid SHALL use its default, and SHALL be reported as invalid, so that it can be shown to the merchant.

#### Scenario: Settings never set
- **WHEN** a product has neither setting
- **THEN** the forecast uses a 7-day lead time and zero safety stock, and reports no invalid setting

#### Scenario: Invalid value
- **WHEN** a product's lead time is stored as -3
- **THEN** the forecast uses a 7-day lead time and reports the lead time as invalid

#### Scenario: Merchant edits a setting
- **WHEN** a merchant opens a product in the Shopify admin
- **THEN** they can view and edit both settings there, and values outside the allowed range are rejected on save
