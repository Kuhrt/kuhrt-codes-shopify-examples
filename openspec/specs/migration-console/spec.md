# migration-console Specification

## Purpose

An in-admin page that walks a merchant through the safe migration order: enable the app embed, confirm it is live, then remove the app's legacy script tags. It encodes the sequence the migration guide describes, so the step that causes double-loading or a missing widget can't be done out of order.

## Requirements

### Requirement: Shows app embed status for the live theme
The console SHALL show whether the announcement bar app embed is active on the store's published theme. It SHALL determine this without requesting theme access scopes.

#### Scenario: Embed active
- **WHEN** the merchant opens the console and the embed is enabled on the published theme
- **THEN** the console shows the embed as active

#### Scenario: Embed inactive
- **WHEN** the merchant opens the console and the embed is not enabled on the published theme
- **THEN** the console shows the embed as inactive, with an action to enable it

#### Scenario: Status cannot be determined
- **WHEN** the embed status lookup fails or is unavailable
- **THEN** the console shows the status as unknown with an explanation and a retry action, and treats the embed as not confirmed for gating purposes

### Requirement: Deep links to enable the embed
The enable action SHALL open the theme editor on the published theme, with the App embeds panel open and this app's embed pre-activated for the merchant to save.

#### Scenario: Merchant follows the enable action
- **WHEN** the merchant activates the enable action
- **THEN** the theme editor opens on the published theme, with this app's announcement bar embed toggled on and awaiting save

#### Scenario: Status refreshes on return
- **WHEN** the merchant saves in the theme editor and returns to the console
- **THEN** the embed status is re-checked without a manual page reload

### Requirement: Lists the app's legacy script tags
The console SHALL list every script tag this app owns on the store, showing each tag's source URL, display scope, and creation date. An empty list SHALL be shown as a completed migration step, not as an error.

#### Scenario: Tags present
- **WHEN** the app owns two script tags on the store
- **THEN** the console lists both, with source URL, display scope, and creation date

#### Scenario: No tags
- **WHEN** the app owns no script tags
- **THEN** the console shows the legacy cleanup step as complete

#### Scenario: Audit query fails
- **WHEN** the script tag query fails
- **THEN** the console shows an error state naming the failed step and offering a retry, and does not show the list as empty

### Requirement: Removal is gated on a confirmed embed
Removing a script tag SHALL be unavailable until the embed is confirmed active on the published theme. Removal SHALL require an explicit in-page confirmation. Its outcome SHALL be shown to the merchant.

#### Scenario: Embed not confirmed
- **WHEN** the embed status is inactive or unknown
- **THEN** every remove action is disabled, with an explanation that the embed must be enabled first

#### Scenario: Confirmation states removal is permanent
- **WHEN** the merchant starts removing a script tag
- **THEN** the confirmation states that a removed script tag can't be recreated, because Shopify blocks script tag creation, and removal proceeds only after the merchant confirms

#### Scenario: Successful removal
- **WHEN** the embed is active, and the merchant removes a script tag and confirms
- **THEN** the tag is deleted, disappears from the list, and a success message is shown

#### Scenario: Removal rejected by the API
- **WHEN** the delete request returns a user error or fails
- **THEN** the tag stays in the list, and an error message shows the reason

#### Scenario: Server rejects a forged removal
- **WHEN** a removal request names a script tag ID the app does not own on this store
- **THEN** the server rejects it and no delete is sent to the Admin API

### Requirement: Recheck guidance after theme changes
The console SHALL tell the merchant that app embed activation is per theme, and that the status must be rechecked after publishing a different theme.

#### Scenario: Guidance visible
- **WHEN** the merchant views the console
- **THEN** guidance about per-theme activation and rechecking after a theme change is visible near the embed status
