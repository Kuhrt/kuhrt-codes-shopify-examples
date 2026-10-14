# Spec Delta

## Purpose

The checkout behavior of the wholesale discount: which buyers qualify, how their quantities are counted, which tier applies, and how the discount fails safely when its configuration is missing or invalid.

## ADDED Requirements

### Requirement: Only tagged customers qualify
The discount SHALL apply only when the buyer is a logged-in customer who carries the customer tag named in the discount's configuration. Guests and customers without the tag SHALL receive no discount from it.

#### Scenario: Tagged customer
- **WHEN** a logged-in customer tagged with the configured tag has a cart that reaches a tier
- **THEN** the discount applies

#### Scenario: Untagged customer
- **WHEN** a logged-in customer without the configured tag has the same cart
- **THEN** the discount applies to no line

#### Scenario: Guest checkout
- **WHEN** a buyer who is not logged in has the same cart
- **THEN** the discount applies to no line

#### Scenario: Tag changed without a redeploy
- **WHEN** the configured tag on a discount is changed to a different tag
- **THEN** customers with the new tag qualify and customers with only the old tag do not, with no new app version deployed

### Requirement: Quantity is counted per product
For each product in the cart, the qualifying quantity SHALL be the sum of the quantities of every cart line for that product, across all its variants. Lines whose merchandise is not a product variant SHALL be ignored.

#### Scenario: Mixed variants of one product
- **WHEN** a qualifying customer's cart has 6 of a product in size S and 6 of the same product in size M, and the lowest tier starts at 10
- **THEN** both lines receive that tier's discount

#### Scenario: Different products are counted separately
- **WHEN** a qualifying customer's cart has 6 of one product and 6 of another, and the lowest tier starts at 10
- **THEN** neither product's lines are discounted

#### Scenario: Non-product line
- **WHEN** the cart contains a line whose merchandise is not a product variant
- **THEN** that line is not discounted and does not count toward any product's quantity

### Requirement: Highest qualifying tier applies
For each product, the discount SHALL apply the percentage of the tier with the largest minimum quantity that the product's quantity meets or exceeds. Only one tier SHALL apply to a product. Every line of that product SHALL receive the tier's percentage.

#### Scenario: Between tiers
- **WHEN** tiers are 10+ at 10% and 50+ at 15%, and a qualifying customer has 20 of a product
- **THEN** every line of that product is discounted 10%

#### Scenario: Exactly on a threshold
- **WHEN** tiers are 10+ at 10% and 50+ at 15%, and a qualifying customer has exactly 50 of a product
- **THEN** every line of that product is discounted 15%, and not also 10%

#### Scenario: Below the lowest tier
- **WHEN** a qualifying customer has fewer of a product than the lowest tier's minimum
- **THEN** that product's lines are not discounted

### Requirement: Discount is a product-level percentage
The discount SHALL reduce eligible product lines by a percentage. It SHALL NOT produce order-level or shipping discounts. When the discount is not set up to produce product discounts, it SHALL apply nothing.

#### Scenario: Product class
- **WHEN** a qualifying cart is evaluated by a discount set up for product discounts
- **THEN** the only discounts produced target cart lines

#### Scenario: Product class not enabled
- **WHEN** the discount is not set up to produce product discounts
- **THEN** it applies nothing

### Requirement: Valid configuration
A configuration SHALL be valid only when all of these hold:
- the tag is a non-empty string;
- there are 1 to 5 tiers;
- each minimum quantity is a whole number of at least 1;
- each percentage is a whole number from 1 to 100;
- minimum quantities and percentages both strictly increase from one tier to the next.

#### Scenario: Valid configuration
- **WHEN** the configuration has tag `wholesale` and tiers 10+ at 10% and 50+ at 15%
- **THEN** it is accepted

#### Scenario: Out-of-range or malformed values
- **WHEN** the configuration has an empty tag, zero tiers, more than 5 tiers, a minimum below 1, a percentage outside 1 to 100, or a non-whole number
- **THEN** it is rejected

#### Scenario: Tiers out of order
- **WHEN** a later tier's minimum is not larger than the previous tier's, or its percentage is not larger
- **THEN** the configuration is rejected

### Requirement: Invalid or missing configuration fails safe
When the discount has no configuration, or its configuration is invalid, the discount SHALL apply nothing and SHALL NOT fail the checkout. The run log SHALL state why nothing applied: the Function's own reason for an invalid configuration, or Shopify's run error when the tag is missing.

#### Scenario: Missing configuration
- **WHEN** a discount backed by the Function has no configuration metafield, or its configuration has no tag
- **THEN** no line is discounted, checkout proceeds at full price, and the run log records the run as failed because the tag was not provided

#### Scenario: Invalid configuration
- **WHEN** the configuration fails validation
- **THEN** no line is discounted, checkout proceeds at full price, and the run log names the rule that failed

### Requirement: Behavior is verified without a store
The Function SHALL have automated tests that run in the workspace quality gate and in CI with no store or Shopify credentials. The tests SHALL include fixtures that run the compiled Function against recorded inputs and compare its exact output.

#### Scenario: CI run
- **WHEN** CI runs the quality gate on a pull request
- **THEN** it builds the Function and runs its unit and fixture tests, using no Shopify credentials

#### Scenario: Output drift
- **WHEN** a change alters the Function's output for any recorded fixture input
- **THEN** the fixture test fails
