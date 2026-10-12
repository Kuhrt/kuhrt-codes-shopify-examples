import { ApiType, shopifyApiProject } from '@shopify/api-codegen-preset';
import { ApiVersion } from '@shopify/shopify-app-react-router/server';
import type { IGraphQLConfig } from 'graphql-config';

const config: IGraphQLConfig = {
  projects: {
    default: shopifyApiProject({
      apiType: ApiType.Admin,
      apiVersion: ApiVersion.October26,
      documents: ['./app/**/*.{js,ts,jsx,tsx}'],
      outputDir: './app/types'
    })
  }
};

export default config;
