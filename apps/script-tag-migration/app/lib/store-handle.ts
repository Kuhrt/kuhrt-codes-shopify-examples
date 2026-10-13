const MYSHOPIFY_SUFFIX = '.myshopify.com';

/** The part of a shop domain before `.myshopify.com`, as used in admin URLs. */
export function storeHandle(shopDomain: string): string {
  return shopDomain.endsWith(MYSHOPIFY_SUFFIX)
    ? shopDomain.slice(0, -MYSHOPIFY_SUFFIX.length)
    : shopDomain;
}
