import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/index.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.discount-details.function-settings.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Settings.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.discount-details.function-settings.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/form.ts' {
  const shopify: import('@shopify/ui-extensions/admin.discount-details.function-settings.render').Api;
  const globalThis: { shopify: typeof shopify };
}
