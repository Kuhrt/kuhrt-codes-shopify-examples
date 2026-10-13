# legacy-script-tag-delivery Specification

## Purpose

A tested reference implementation of the pre-2026 way to ship the announcement bar: a ScriptTag that loads an app-served script. It exists so the migration has a concrete "before". Shopify now rejects script tag creation, so this path documents and tests that behavior rather than running in production.

## Requirements

### Requirement: App serves the legacy script
The app SHALL serve the legacy announcement bar script over HTTPS at a stable public URL. It SHALL be served with a JavaScript content type and a cache lifetime suitable for a versioned asset.

#### Scenario: Script request
- **WHEN** a browser requests the legacy script URL
- **THEN** the response is 200, served over HTTPS with a JavaScript content type

### Requirement: Legacy script is configured through its URL
The legacy script SHALL read its settings from the query string of its own script URL, using the same setting names and validation as the app embed. Unknown parameters SHALL be ignored.

#### Scenario: Configured via query string
- **WHEN** the legacy script is loaded with message, end time, and colors in its URL query string
- **THEN** the bar renders with those settings and passes the same announcement-bar scenarios as the embed

#### Scenario: Missing message parameter
- **WHEN** the legacy script URL has no message parameter
- **THEN** no bar renders, and the console has one warning naming the missing setting

### Requirement: Install code creates the script tag and surfaces rejection
The reference install code SHALL call the Admin API to create a script tag pointing at the legacy script URL with the encoded settings. Any API user error, including Shopify's creation block, SHALL be returned to the caller as a typed failure with the API's message, never swallowed or thrown as an untyped exception.

#### Scenario: Creation succeeds (historical behavior)
- **WHEN** the Admin API accepts the creation request
- **THEN** the install code returns the created script tag's ID and source URL

#### Scenario: Creation blocked by Shopify
- **WHEN** the Admin API responds with a user error, as it does for every script tag creation after 2026-10-01
- **THEN** the install code returns a failure carrying the API's error message and field, and makes no further API calls

#### Scenario: Network or GraphQL error
- **WHEN** the Admin API request fails with a transport error or a top-level GraphQL error
- **THEN** the install code returns a failure that distinguishes it from a user error

### Requirement: Reference code is not wired into the live install flow
The deployed app SHALL NOT attempt to create script tags on install or at any other time. The legacy install code SHALL be reachable only from tests and an explicit, documented developer command.

#### Scenario: Merchant installs the app
- **WHEN** a merchant installs the deployed app
- **THEN** no script tag creation request is sent to the Admin API

### Requirement: Rejection is verified against a real store
The repository SHALL record the exact response Shopify returns for a script tag creation attempt against the `kuhrt-codes` development store, including the date and API version checked.

#### Scenario: Documented rejection
- **WHEN** a reader opens the migration guide's section on the creation block
- **THEN** it shows the observed error response, the API version, and the date it was checked
