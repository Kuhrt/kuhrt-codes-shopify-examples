# app-installation Specification

## Purpose

The hosted app's install and uninstall lifecycle: OAuth with the smallest scope set that supports the migration console, durable sessions on the hosting platform, and clean removal of stored data on uninstall.

## Requirements

### Requirement: Requests only the scopes the console needs
The app SHALL request exactly one access scope, `write_script_tags`, which also grants script tag read access. It SHALL NOT request theme, product, customer, or order scopes.

#### Scenario: Install consent screen
- **WHEN** a merchant starts installing the app
- **THEN** the consent screen lists only script tag access

#### Scenario: Scope list matches the README
- **WHEN** the app's configured scopes are compared with the scopes table in the README
- **THEN** they are identical

### Requirement: Installs through OAuth and opens the console
Installing the app SHALL complete OAuth and store an offline session for the shop. It SHALL then land the merchant on the migration console inside the Shopify admin.

#### Scenario: First install
- **WHEN** a merchant installs the app on a store
- **THEN** OAuth completes, a session for that shop is stored, and the migration console opens embedded in the admin

### Requirement: Sessions survive restarts and redeploys
Stored sessions SHALL persist across app restarts and redeploys, so a merchant does not have to reinstall after a deploy.

#### Scenario: Redeploy
- **WHEN** the app is redeployed after a merchant installed it
- **THEN** the merchant opens the console without being asked to reinstall or re-consent

### Requirement: Uninstall removes stored shop data
When the app is uninstalled, the app SHALL delete every session and any other data it stores for that shop, triggered by the verified uninstall webhook.

#### Scenario: Merchant uninstalls
- **WHEN** the app receives a verified `app/uninstalled` webhook for a shop
- **THEN** all stored data for that shop is deleted

#### Scenario: Unverified webhook
- **WHEN** a request to the webhook endpoint carries a signature that does not match its body
- **THEN** it is rejected with a 401 and no data is deleted

#### Scenario: Malformed webhook
- **WHEN** a request to the webhook endpoint is missing the signature or another required Shopify webhook header
- **THEN** it is rejected with a 400 and no data is deleted

#### Scenario: Deletion fails
- **WHEN** a verified uninstall webhook arrives but the stored sessions can't be deleted
- **THEN** the endpoint responds with a server error, so Shopify retries the delivery
