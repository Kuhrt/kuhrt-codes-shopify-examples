export const BLOCK_HANDLE = 'announcement-bar';

export type EmbedStatus = 'active' | 'inactive' | 'unknown';

export type ExtensionList = Awaited<ReturnType<typeof shopify.app.extensions>>;

interface BlockActivation {
  handle: string;
  status: string;
}

function isBlockWithHandle(activation: object): activation is BlockActivation {
  return 'handle' in activation && activation.handle === BLOCK_HANDLE;
}

/**
 * Only an `active` block entry matching the embed's block handle confirms the embed on the published
 * theme. A missing entry, `unavailable`, or any unrecognised value is `unknown`.
 */
export function embedStatusFrom(extensions: ExtensionList | undefined): EmbedStatus {
  const activations: object[] =
    extensions
      ?.filter((extension) => extension.type === 'theme_app_extension')
      .flatMap((extension) => extension.activations) ?? [];
  const block = activations.find(isBlockWithHandle);

  switch (block?.status) {
    case 'active':
      return 'active';
    case 'available':
      return 'inactive';
    default:
      return 'unknown';
  }
}

/** Opens the published theme's App embeds panel with this app's embed pre-activated. */
export function themeEditorLink(storeHandle: string, clientId: string): string {
  const url = new URL(
    `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor`
  );
  // Shopify expects a literal slash in `activateAppId`.
  url.search = `context=apps&activateAppId=${encodeURIComponent(clientId)}/${BLOCK_HANDLE}`;
  return url.toString();
}
