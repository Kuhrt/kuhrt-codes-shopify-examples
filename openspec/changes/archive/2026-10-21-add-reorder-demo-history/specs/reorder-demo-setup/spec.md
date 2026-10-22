# Spec Delta

## Purpose

The reproducible demo data for the reorder point sample: products, two locations, stock, and a backdated sales history shaped so the admin block shows each stock status, recreated on any development store with one command.

## ADDED Requirements

### Requirement: Store must be named
The demo setup SHALL refuse to run unless a store is named explicitly. It SHALL exit non-zero without contacting any store when the store argument is missing.

#### Scenario: No store named
- **WHEN** the setup is run without a store argument
- **THEN** it exits non-zero without contacting any store

### Requirement: Two locations
After the setup runs, the store SHALL have at least two active locations stocking the demo products. The setup SHALL create a location only when the store has fewer than two, and SHALL NOT modify existing locations.

#### Scenario: Store with one location
- **WHEN** the setup runs against a store with one location
- **THEN** a second location exists afterwards, and the demo products are stocked at both

#### Scenario: Store with two or more locations
- **WHEN** the setup runs against a store that already has two locations
- **THEN** no location is created

### Requirement: Demo products cover every status
The setup SHALL create demo products with tracked inventory whose stock and sales history, on the day after the setup runs, produce these forecasts:
- one product at reorder now;
- one product healthy;
- one product with far more stock than its sales need;
- one product whose 60-day average is at least twice its 30-day average.

Each product's stock SHALL be split across two locations.

#### Scenario: Forecasts after setup
- **WHEN** the setup has run, and the block is opened on each demo product before the next day ends
- **THEN** each product shows the status it was designed for

### Requirement: Backdated sales history
The setup SHALL create orders dated on each of the last 60 days before today, containing the demo products' sales for that day. The orders SHALL be identifiable as demo orders, SHALL NOT send any notification to a customer, and SHALL NOT change inventory quantities.

#### Scenario: History visible to the forecast
- **WHEN** the setup has run
- **THEN** the sales source the block uses reports each demo order on its backdated day

#### Scenario: No emails or stock changes
- **WHEN** the setup creates orders
- **THEN** no order confirmation is sent, and each demo product's stock at each location equals the quantity the setup set

### Requirement: Re-running is safe and brings history up to date
Running the setup again SHALL NOT duplicate any product, location or day's order. It SHALL create orders only for days in the last 60 that have none, and SHALL reset each demo product's stock to its designed quantities.

#### Scenario: Second run on the same day
- **WHEN** the setup runs twice on the same day
- **THEN** the second run creates no product, location or order

#### Scenario: Run days later
- **WHEN** the setup runs again three days after its last run
- **THEN** it creates orders only for the three missing days, and the forecasts again match their designed statuses

#### Scenario: Interrupted run
- **WHEN** a run is stopped partway through creating orders, and then run again
- **THEN** the second run creates only the orders that are still missing

### Requirement: Order creation respects the store's rate limit
The setup SHALL pace order creation to stay within the store's order creation limit, and SHALL report its progress while doing so. When a request is throttled anyway, it SHALL wait and retry rather than fail.

#### Scenario: Sixty missing days on a development store
- **WHEN** the setup creates 60 orders on a development store
- **THEN** it finishes without a throttling failure, showing progress as it goes

### Requirement: Failures name the step
When any request fails or returns user errors, the setup SHALL stop, exit non-zero, and name the step and the reason.

#### Scenario: Missing scope
- **WHEN** the seeder app lacks a scope a step needs
- **THEN** the setup exits non-zero, naming that step and the error Shopify returned
