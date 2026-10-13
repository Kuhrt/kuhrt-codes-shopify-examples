# Migrating a storefront script tag to an app embed

Shopify is retiring storefront script tags. If your app (or an app you maintain for a client) injects JavaScript into the online store through a script tag, it has to move to a theme app extension before existing tags stop loading. This guide walks through the move in the order that keeps the storefront working throughout, using the announcement bar in this repository as the worked example.

## The dates

| Date           | What happens                                                                                                                                                                  | Source                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 October 2026 | `scriptTagCreate` and `scriptTagUpdate` (and REST `POST`/`PUT` on `ScriptTag`) fail on every API version. Existing tags keep loading. Reading and deleting tags keep working. | [Storefront script tags](https://shopify.dev/docs/apps/build/online-store/script-tag-deprecation/storefront) |
| 1 March 2027   | Shopify stops injecting script tags into storefront pages. Any script still delivered this way stops running.                                                                 | [Developer changelog](https://shopify.dev/changelog/posts/online-store-script-tags-deprecation)              |

Script tags shown on the Order status page (`display_scope` of `ORDER_STATUS` or `ALL`) follow a separate, earlier schedule. See [Order status script tags](https://shopify.dev/docs/apps/build/online-store/script-tag-deprecation/order-status).

### What the block looks like

This is the response this app got when it tried to create a script tag on a development store, with Admin API `2026-10`, on 13 October 2026. It is saved as [`legacy/fixtures/script-tag-create-rejection.json`](legacy/fixtures/script-tag-create-rejection.json):

```json
{
  "data": {
    "scriptTagCreate": {
      "scriptTag": null,
      "userErrors": [
        {
          "field": null,
          "message": "This app can't create or update script tags. Use theme app extensions instead."
        }
      ]
    }
  }
}
```

The HTTP status is 200. The failure arrives as a user error with no field, so code that only checks the status code or only looks for top-level GraphQL `errors` will report success. Development stores are not exempt.

## 1. Audit

Find every script tag your app owns on each store. The [`scriptTags`](https://shopify.dev/docs/api/admin-graphql/latest/queries/scriptTags) query returns only tags created by the app whose token you use, so run it once per store with that store's token. During development, `shopify app dev` opens GraphiQL with the app's token when you press `g`; in production, send it to `https://{store}.myshopify.com/admin/api/2026-10/graphql.json` with the store's token in the `X-Shopify-Access-Token` header:

```graphql
query ScriptTags($first: Int!, $after: String) {
  scriptTags(first: $first, after: $after) {
    nodes {
      id
      src
      displayScope
      cache
      createdAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

For each tag, write down what the script does on the page: what it renders, where its settings come from, and whether it renders anything at all. That answer decides step 2.

If you're a merchant rather than the app's developer, you can't run this query for another app's tags. The [store checker](https://shopify.kuhrt.codes/tools/checker) reports whether a storefront still loads script tags, so you know which apps to chase.

This app's console runs the same audit for its own tags. See [`app/services/script-tags.server.ts`](app/services/script-tags.server.ts).

## 2. Map the script to an app embed

### Analytics-only scripts: use a web pixel

If the script only sends events (page views, conversions, customer behaviour) and renders nothing, don't move it to an app embed. Use a [web pixel](https://shopify.dev/docs/apps/build/marketing/pixels), created with [`webPixelCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/webPixelCreate). Pixels run in a sandbox on every page, including checkout, and receive Shopify's standard customer events, so you stop scraping the DOM for them. They need the `write_pixels` and `read_customer_events` scopes, which the merchant approves.

### Everything else: an app embed block

An [app embed block](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-blocks) in a [theme app extension](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions) loads on every storefront page, works on vintage and Online Store 2.0 themes, and is configured in the theme editor. Shopify's [Migrate to theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/migrate) guide covers the general approach. ([App blocks](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-blocks-for-themes) only work in themes with JSON templates, so they are not a drop-in replacement.)

Here is how each concern moved in this repository. The bar's behaviour lives once in [`widget/`](widget/); each delivery path is a thin adapter around it.

| Concern       | Legacy script tag                                                                                                                                                                                              | App embed                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection     | The app calls `scriptTagCreate` with the script's URL, and Shopify adds a `<script src>` to every page. [`legacy/install.server.ts`](legacy/install.server.ts)                                                 | The block declares `"target": "body"`, and Shopify includes it on every page once the merchant enables it. The app makes no API call. [`extensions/announcement-bar/blocks/announcement-bar.liquid`](extensions/announcement-bar/blocks/announcement-bar.liquid)                                                                                                                                                                                              |
| Configuration | Settings are encoded into the script URL's query string, so changing them means replacing the tag. [`legacy/settings-url.ts`](legacy/settings-url.ts), read back by [`widget/settings.ts`](widget/settings.ts) | Settings are the block's schema, edited by the merchant in the theme editor and rendered into `data-*` attributes. [`announcement-bar.liquid`](extensions/announcement-bar/blocks/announcement-bar.liquid) (schema), read by [`widget/settings.ts`](widget/settings.ts). Theme settings have no date picker, so the end time is typed as store-local `YYYY-MM-DD HH:MM` and converted in Liquid, where the legacy URL carries an ISO 8601 time with an offset |
| Rendering     | JavaScript builds the bar after the page loads. [`widget/render.ts`](widget/render.ts), mounted by [`widget/mount.ts`](widget/mount.ts) (`mountLegacy`)                                                        | Liquid renders the bar's markup on the server; JavaScript only adds the countdown and dismiss button. [`announcement-bar.liquid`](extensions/announcement-bar/blocks/announcement-bar.liquid), enhanced by [`widget/enhance.ts`](widget/enhance.ts) via `mountEmbed`                                                                                                                                                                                          |
| Removal       | Only the app can remove its tag, with `scriptTagDelete`; uninstalling also removes it. [`app/services/script-tags.server.ts`](app/services/script-tags.server.ts)                                              | The merchant turns the embed off in the theme editor; uninstalling removes it.                                                                                                                                                                                                                                                                                                                                                                                |

Two things are worth copying even if your script is different:

- **Render in Liquid, enhance in JavaScript.** Server-rendered markup shows up with the page, with no flash and no layout shift. The legacy script can't do that: it has to wait for its stylesheet before adding the bar, or the page jumps.
- **Guard against loading twice.** While both paths are live, a store loads both. This bar marks the page when it mounts, so a second copy does nothing. The legacy script waits for `DOMContentLoaded` and backs off if the embed's markup is on the page, so the embed always wins.

## 3. Ship the embed

Deploy the theme app extension with `shopify app deploy`, which releases a new app version. The embed is now available on every store that has the app installed, but it is **off** everywhere: nothing changes on any storefront yet. Keep the script tag in place until step 6, so there is no gap.

## 4. Get merchants to enable it

There is no API to enable an app embed. The merchant has to switch it on in the theme editor and save. Your job is to make that one click:

- **Deep link.** This URL opens the published theme's App embeds panel with your embed already toggled on, so the merchant only has to press Save ([deep linking](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#deep-linking)):

  ```text
  https://admin.shopify.com/store/{store_handle}/themes/current/editor?context=apps&activateAppId={client_id}/{block_handle}
  ```

  `{client_id}` is the app's client ID (`SHOPIFY_API_KEY`), and `{block_handle}` is the block's filename without `.liquid`. Keep the `/` unencoded. This app builds it in [`app/components/console/embed.ts`](app/components/console/embed.ts).

- **Onboarding nudges.** Put the embed's status and the deep link on your app's home page, so every merchant who opens the app sees whether it is on. `extensions()` only runs in the admin, so record the status your app home sees each time a merchant opens it. Then email the merchants whose stores still report it off, with the link, well before 1 March 2027.

## 5. Verify it is live

In the app, call App Bridge's [`shopify.app.extensions()`](https://shopify.dev/docs/api/app-bridge-library/apis/app) (no scope needed). Find your block by its handle. A `status` of `active` means it is enabled on the **published** theme; `available` means it is installed but off, including when it is only on for an unpublished theme. See [Confirm that your app embed is active](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/migrate#confirm-that-your-app-embed-is-active). This app maps that to active, inactive or unknown in [`app/components/console/embed.ts`](app/components/console/embed.ts).

Then check the storefront itself: open it in a private window, confirm the embed's output is there, and confirm it appears **once**. With both the tag and the embed loaded, a script that doesn't guard against double loading will render twice.

## 6. Remove the old tags

Delete each tag with [`scriptTagDelete`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/scriptTagDelete) only once the embed is confirmed active on that store. **Since 1 October 2026 this can't be undone:** the tag can't be recreated, so removing it early leaves the store with nothing until the merchant enables the embed.

This app's console enforces that order: the Remove button stays disabled until `extensions()` reports the embed active, and while a status check is running ([`app/components/console/ConsoleView.tsx`](app/components/console/ConsoleView.tsx)). The merchant then confirms in a dialog, and the server re-lists the app's own tags and deletes only an ID that is in that list ([`app/services/script-tags.server.ts`](app/services/script-tags.server.ts)).

The gate is in the UI only. The server can't check embed status without the `read_themes` scope, which this app chose not to request. Someone who bypasses the UI could delete a tag early, but only on their own store. If you can't accept that, request `read_themes` and check the theme's `config/settings_data.json` on the server before deleting; note that a turned-off embed stays in that file with `disabled: true`.

## 7. Recheck after theme changes

An app embed is enabled per theme. When a merchant publishes a different theme, or a new copy of their theme, the embed is off on it, and `extensions()` reports `available` again. The script tag would have survived that; the embed doesn't.

So keep showing the status and the deep link on the app home after the migration, not just during it. This app's console refreshes the status whenever the merchant returns to the tab. Keep recording it as described in step 4, so a store that drops back to off gets the nudge again.

## Want this done for you?

I do these migrations for app developers and agencies: audit, embed, rollout, and tag removal, store by store. Run your store through the [store checker](https://shopify.kuhrt.codes/tools/checker) to see what still loads through script tags, then [work with me](https://shopify.kuhrt.codes/work-with-me).
