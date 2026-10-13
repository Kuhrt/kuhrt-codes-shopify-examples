import { BLOCK_HANDLE } from './embed';

type ExtensionList = Awaited<ReturnType<typeof shopify.app.extensions>>;
type BlockStatus = 'active' | 'available' | 'unavailable';

interface ExtensionsPayloadOptions {
  status: BlockStatus;
  blockHandle?: string;
  extensionHandle?: string;
}

/** The theme app extension entry as App Bridge returns it. */
export function extensionsPayload({
  status,
  blockHandle = BLOCK_HANDLE,
  extensionHandle = 'theme-app-extension'
}: ExtensionsPayloadOptions): ExtensionList {
  return [
    {
      handle: extensionHandle,
      type: 'theme_app_extension',
      activations: [
        {
          target: 'body',
          handle: blockHandle,
          name: 'Announcement bar',
          status,
          activations:
            status === 'active'
              ? [{ target: 'theme/1', themeId: 'gid://shopify/OnlineStoreTheme/1' }]
              : []
        }
      ]
    }
  ];
}
