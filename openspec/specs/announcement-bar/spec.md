# announcement-bar Specification

## Purpose

The storefront announcement bar's behavior, independent of how it is delivered. The legacy script tag and the modern app embed SHALL behave identically, so the migration changes delivery, not what shoppers see.

## Requirements

### Requirement: Shows a message with an optional link
The bar SHALL show the configured message. When a link URL is configured, the message SHALL be a link to it. The bar SHALL be fixed to the bottom of the viewport and SHALL NOT shift page content when it appears.

#### Scenario: Message without link
- **WHEN** the bar is configured with a message and no link
- **THEN** the message renders as plain text in a bar fixed to the bottom of the viewport

#### Scenario: Message with link
- **WHEN** the bar is configured with a message and a link URL
- **THEN** the message renders as a link to that URL

#### Scenario: No layout shift
- **WHEN** the bar appears on a page
- **THEN** no page content moves, and the cumulative layout shift caused by the bar is zero

#### Scenario: Empty message
- **WHEN** the configured message is empty or whitespace only
- **THEN** no bar renders

### Requirement: Counts down to a configured end time
When an end time is configured and in the future, the bar SHALL show the time remaining in days, hours, minutes, and seconds. It SHALL update once per second.

#### Scenario: Countdown in progress
- **WHEN** the end time is 1 day, 2 hours, 3 minutes, and 4 seconds in the future
- **THEN** the countdown shows 1 day, 2 hours, 3 minutes, and 4 seconds remaining, and one second later shows 3 seconds

#### Scenario: Under one day remaining
- **WHEN** less than one day remains
- **THEN** the days unit is omitted and hours, minutes, and seconds are shown

#### Scenario: No end time
- **WHEN** no end time is configured
- **THEN** the bar shows the message with no countdown

### Requirement: Behaves as configured when the countdown ends
The configuration SHALL choose what happens when the end time passes: hide the bar, or replace the message with a configured ended message. The change SHALL happen without a page reload.

#### Scenario: Hide on end
- **WHEN** the countdown reaches zero and the ended behavior is "hide"
- **THEN** the bar is removed from view and the countdown stops updating

#### Scenario: Ended message
- **WHEN** the countdown reaches zero and the ended behavior is "show ended message"
- **THEN** the bar shows the ended message with no countdown

#### Scenario: Page loaded after the end time
- **WHEN** a page loads after the end time has passed
- **THEN** the bar starts in its ended state; the countdown is never shown

### Requirement: Invalid settings fail safe
Invalid settings SHALL never break the storefront or throw uncaught errors. An unparseable end time SHALL be treated as no end time. Each invalid setting SHALL log one console warning naming the setting.

#### Scenario: Unparseable end time
- **WHEN** the end time setting is not a valid date and time
- **THEN** the bar shows the message without a countdown, and the console has one warning naming the end time setting

#### Scenario: Unsafe link
- **WHEN** the link URL uses a scheme other than `http`, `https`, or a site-relative path
- **THEN** the message renders without a link, and the console has one warning naming the link setting

### Requirement: Shoppers can dismiss the bar
When dismissal is enabled, the bar SHALL show a dismiss control. A dismissed bar SHALL stay hidden for that shopper on later page loads until the message or end time changes. The bar SHALL still work when browser storage is unavailable.

#### Scenario: Dismiss persists across pages
- **WHEN** a shopper dismisses the bar and then navigates to another page
- **THEN** the bar does not appear

#### Scenario: New campaign reappears
- **WHEN** a shopper dismissed the bar, and the merchant then changes the message or end time
- **THEN** the bar appears again for that shopper

#### Scenario: Storage blocked
- **WHEN** browser storage throws on access
- **THEN** the bar renders and can be dismissed for the current page, and no error is thrown

### Requirement: Accessible to keyboard and assistive technology
The bar SHALL be a labelled landmark region. The dismiss control SHALL be a keyboard-operable button with an accessible name. Per-second countdown updates SHALL NOT be announced as live updates, and the end time SHALL be exposed as a machine-readable date.

#### Scenario: Automated accessibility audit
- **WHEN** an automated accessibility audit runs against a page showing the bar with a countdown and dismiss control
- **THEN** it reports no violations attributable to the bar

#### Scenario: Keyboard dismissal
- **WHEN** a keyboard user tabs to the dismiss control and presses Enter or Space
- **THEN** the bar is dismissed and focus moves to the document body rather than being lost

### Requirement: Only one bar renders per page
When both delivery paths load on the same page, exactly one bar SHALL render. The app embed's bar SHALL win, and the legacy script SHALL log one console warning that it stood down.

#### Scenario: Legacy script and app embed both active
- **WHEN** a page contains the app embed's bar and also loads the legacy script
- **THEN** exactly one bar is visible, it is the app embed's, and the console has one warning from the legacy script

#### Scenario: Legacy script loaded twice
- **WHEN** the legacy script is included twice on the same page
- **THEN** exactly one bar renders
