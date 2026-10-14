# Spec Delta

## Purpose

How a merchant creates, configures, and finds wholesale discounts in the Shopify admin: the settings form inside Shopify's discount pages, and the app's landing page that lists wholesale discounts and starts new ones.

## ADDED Requirements

### Requirement: Settings appear in Shopify's discount pages
When a merchant creates or edits a discount of this app's type, the discount page SHALL show the wholesale settings: the customer tag and the tier list. Every other discount field (title, dates, eligibility, combinations) SHALL stay Shopify's own.

#### Scenario: Create
- **WHEN** a merchant creates a discount of this app's type
- **THEN** the page shows the wholesale settings alongside Shopify's standard discount fields

#### Scenario: Edit
- **WHEN** a merchant opens an existing wholesale discount
- **THEN** the settings show that discount's saved tag and tiers

### Requirement: New discounts start from a working example
A new wholesale discount SHALL start with tag `wholesale` and two tiers, 10+ at 10% and 50+ at 15%. These defaults SHALL be a valid configuration.

#### Scenario: Defaults
- **WHEN** a merchant opens the create page for this discount type
- **THEN** the settings are pre-filled with the default tag and tiers, and saving without changes produces a working discount

### Requirement: Merchant edits the tag and tiers
The merchant SHALL be able to change the tag, and to change each tier's minimum quantity and percentage. They SHALL be able to add tiers up to 5 and remove tiers down to 1. Adding SHALL be unavailable at 5 tiers, and removing SHALL be unavailable at 1.

#### Scenario: Add and remove
- **WHEN** a merchant adds tiers until there are 5
- **THEN** adding another is unavailable, and removing tiers down to 1 makes removing unavailable

### Requirement: Validation matches the Function
The settings SHALL accept exactly the configurations that `wholesale-tier-pricing` defines as valid. Each invalid field SHALL be marked with an error tied to that field. Saving the discount SHALL be blocked while any field is invalid.

#### Scenario: Invalid field
- **WHEN** a merchant enters a second tier whose percentage is not larger than the first's
- **THEN** that field is marked invalid and the discount cannot be saved

#### Scenario: Agreement with the Function
- **WHEN** any configuration is evaluated by both the settings and the Function's validation
- **THEN** both accept it or both reject it

### Requirement: Saving and discarding
Saving the discount SHALL store the configuration on that discount, where the Function reads it. Discarding changes SHALL restore the last saved configuration.

#### Scenario: Save
- **WHEN** a merchant changes a tier and saves the discount
- **THEN** the next checkout by a qualifying customer uses the new tier

#### Scenario: Discard
- **WHEN** a merchant changes a tier and discards the changes
- **THEN** the settings show the last saved configuration again

#### Scenario: Save fails
- **WHEN** storing the configuration fails
- **THEN** the merchant sees an error, and the previously saved configuration remains in effect

### Requirement: Saved configuration that is invalid is surfaced, not overwritten
When an existing discount's saved configuration is missing or invalid, the settings SHALL show what was saved with its errors marked. They SHALL NOT silently replace it with defaults.

#### Scenario: Invalid saved configuration
- **WHEN** a merchant opens a wholesale discount whose stored configuration fails validation
- **THEN** the settings show the stored values with errors marked, and nothing changes until the merchant edits and saves

### Requirement: App Home lists the store's wholesale discounts
The app's landing page SHALL list every discount backed by this app, and no other discounts. Each row SHALL show the title, the status (active, scheduled or expired) and a tier summary, and SHALL link to that discount's edit page.

#### Scenario: Discounts exist
- **WHEN** the store has wholesale discounts and other discounts
- **THEN** the list shows exactly the wholesale discounts, each with title, status, tier summary and an edit link

#### Scenario: Row with invalid configuration
- **WHEN** a listed discount's configuration is missing or invalid
- **THEN** its row is marked as needing attention instead of showing a tier summary, and the rest of the list renders

### Requirement: App Home states
The landing page SHALL show a distinct loading state, an empty state when no wholesale discounts exist, and an error state with a retry action when the list can't be loaded. The create action SHALL remain available in the empty and error states.

#### Scenario: Empty
- **WHEN** the store has no wholesale discounts
- **THEN** the page shows the empty state and the create action

#### Scenario: Load fails
- **WHEN** the discount list request fails
- **THEN** the page shows the error state with retry and the create action, and retry repeats the request

### Requirement: App Home starts a new discount
The landing page SHALL offer a create action that opens Shopify's discount creation flow for this app's discount type, with the wholesale settings shown.

#### Scenario: Create from App Home
- **WHEN** a merchant uses the create action
- **THEN** Shopify's create page for this discount type opens with the default wholesale settings
