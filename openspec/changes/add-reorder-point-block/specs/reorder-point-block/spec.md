# Spec Delta

## Purpose

The admin block on Shopify's product page: what it shows a merchant about a product's stock, sales and reorder point, where each figure comes from, and how it behaves when data is missing or a request fails.

## ADDED Requirements

### Requirement: Block appears on the product page
The app SHALL provide a block on the product details page of the Shopify admin. Once a merchant adds it, it SHALL show the forecast for the product being viewed.

#### Scenario: Merchant adds the block
- **WHEN** a merchant adds the app's block to a product page
- **THEN** the block shows that product's figures, and other products' pages show their own

### Requirement: Stock by location
The block SHALL list each location that stocks any tracked variant of the product, with that location's available quantity summed across variants, and the total available stock used by the forecast.

#### Scenario: Two locations
- **WHEN** a product has stock at two locations
- **THEN** the block shows both locations with their quantities, and a total equal to their sum

#### Scenario: Location with no stock record
- **WHEN** a location does not stock any of the product's variants
- **THEN** it is not listed

### Requirement: Forecast figures
For a product with tracked inventory, the block SHALL show:
- the 30-day and 60-day average daily sales;
- days until stockout, or that there is no estimate;
- the suggested reorder point;
- the stock status.

All of these SHALL be the results of the `reorder-forecast` calculation for that product.

#### Scenario: Product with recent sales
- **WHEN** a product has sales in the last 30 days and tracked inventory
- **THEN** the block shows all forecast figures, matching the calculation for the same inputs

#### Scenario: No sales in the last 30 days
- **WHEN** a tracked product has no net sales in the last 30 days
- **THEN** the block shows that there is no stockout estimate, and the reorder point equals the safety stock

### Requirement: Settings are visible and editable
The block SHALL show the lead time and safety stock the forecast used. It SHALL indicate when either is a default, and when a stored value was invalid and replaced by the default. It SHALL tell the merchant where to change them.

#### Scenario: Defaults in use
- **WHEN** a product has no settings stored
- **THEN** the block shows a 7-day lead time and zero safety stock, each marked as a default

#### Scenario: Invalid stored value
- **WHEN** a product's stored lead time is invalid
- **THEN** the block marks the lead time as invalid and shows the default it used instead

#### Scenario: Setting changed
- **WHEN** a merchant changes a product's lead time and the block reloads
- **THEN** the reorder point reflects the new lead time

### Requirement: The block only reads
The block SHALL NOT change any product, inventory, order or metafield data unless the merchant explicitly saves a setting in a form the block provides.

#### Scenario: Viewing a product
- **WHEN** the block loads and renders
- **THEN** no data in the store has changed

### Requirement: Block states
The block SHALL show a loading state while its data is fetched. It SHALL show an error state, with a way to retry, when any request fails or returns errors. It SHALL show a distinct state when no variant of the product tracks inventory. It SHALL never show figures computed from partial data.

#### Scenario: Request fails
- **WHEN** the sales history request fails and the inventory request succeeds
- **THEN** the block shows the error state, not a forecast with missing sales

#### Scenario: Retry
- **WHEN** the merchant retries after a failure and the requests succeed
- **THEN** the block shows the forecast

#### Scenario: Inventory not tracked
- **WHEN** none of the product's variants track inventory
- **THEN** the block says so, and shows no forecast figures

#### Scenario: More history than the block reads
- **WHEN** the product's orders in the last 60 days exceed the number the block reads on one page view
- **THEN** the block says the history is too large to forecast here, and shows no forecast figures

### Requirement: Only this product's sales count
Average daily sales SHALL count only the units of this product's variants, from orders processed in each window, after refunds and removals on those orders. Units of other products in the same orders SHALL NOT count, and dates SHALL be calendar days in the shop's timezone.

#### Scenario: Mixed order
- **WHEN** an order contains 3 units of this product and 5 of another
- **THEN** only the 3 units count toward this product's sales

#### Scenario: Refunded units
- **WHEN** an order had 4 units of this product and 1 was refunded
- **THEN** 3 units count, on the order's processed day

#### Scenario: Late-evening order
- **WHEN** an order is processed at 23:30 in the shop's timezone, which is the next day in UTC
- **THEN** it counts on the shop's calendar day

### Requirement: The answer comes first
The stock status, days until stockout and suggested reorder point SHALL be visible when the block first renders, without the merchant expanding it. Supporting detail (locations, averages, settings) MAY require expanding. For a product stocked at up to five locations, no content SHALL be cut off once expanded.

#### Scenario: First render
- **WHEN** the block renders a forecast
- **THEN** the status, days until stockout and reorder point are visible without expanding it

#### Scenario: Five locations
- **WHEN** a product is stocked at five locations and the merchant expands the block
- **THEN** every location and figure is visible, none cut off
