# Spec Delta

## Purpose

The modern delivery path for the announcement bar: a theme app extension app embed that merchants enable and configure in the theme editor, replacing script tag injection.

## ADDED Requirements

### Requirement: Merchant configures the bar in the theme editor
The app embed SHALL expose every announcement bar setting in the theme editor's App embeds panel: message, link, end time, ended behavior, ended message, dismissal, and background and text colors. The theme editor preview SHALL reflect a saved change without code edits.

#### Scenario: Edit message in theme editor
- **WHEN** a merchant changes the message in the app embed's settings and saves
- **THEN** the storefront shows the new message on the next page load

#### Scenario: Colors applied
- **WHEN** a merchant sets background and text colors
- **THEN** the bar renders with those colors

### Requirement: End time is entered in store-local time
The end time setting SHALL accept a date and time in the store's timezone, in a documented format shown in the setting's help text. The countdown SHALL target that moment in the store's timezone, regardless of the shopper's timezone.

#### Scenario: Shopper in another timezone
- **WHEN** the store is in America/New_York, the end time is "2026-11-27 00:00", and the shopper's browser is in America/Los_Angeles
- **THEN** the countdown reaches zero at 2026-11-27 00:00 Eastern (2026-11-26 21:00 Pacific)

### Requirement: Markup is present in the initial HTML
The app embed SHALL render the bar's markup server-side, so the message is in the storefront's HTML response before any app JavaScript runs. JavaScript SHALL only add the live countdown and dismissal behavior.

#### Scenario: JavaScript disabled
- **WHEN** a storefront page with the enabled embed is loaded with JavaScript disabled
- **THEN** the message is visible

### Requirement: Disabled by default after install
The app embed SHALL be inactive after app installation until the merchant enables it in the theme editor. Disabling it SHALL remove the bar from the storefront.

#### Scenario: Fresh install
- **WHEN** the app is installed and the merchant has not enabled the embed
- **THEN** no bar markup or bar asset appears on the storefront

#### Scenario: Merchant disables the embed
- **WHEN** a merchant turns the embed off in the theme editor and saves
- **THEN** the bar no longer appears on the storefront

### Requirement: Works on vintage and Online Store 2.0 themes
The app embed SHALL render correctly on both an Online Store 2.0 theme and a vintage theme, without theme-specific code or selectors.

#### Scenario: Horizon theme
- **WHEN** the embed is enabled on a store running Horizon
- **THEN** the bar renders and passes the announcement-bar scenarios

#### Scenario: Vintage theme
- **WHEN** the embed is enabled on a store running a vintage theme
- **THEN** the bar renders and passes the announcement-bar scenarios

### Requirement: Stays within storefront performance budgets
The embed's JavaScript SHALL be at most 10 KB compressed, and its CSS at most 100 KB compressed. Its assets SHALL load without blocking rendering.

#### Scenario: Asset budget check
- **WHEN** the extension assets are built
- **THEN** the compressed JavaScript is at most 10 KB, and the build fails if it is not
