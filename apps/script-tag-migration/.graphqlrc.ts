import { ApiType, shopifyApiProject } from '@shopify/api-codegen-preset';
import type { IGraphQLConfig } from 'graphql-config';

import { apiVersion } from './app/api-version';

const config: IGraphQLConfig = {
  projects: {
    default: shopifyApiProject({
      apiType: ApiType.Admin,
      apiVersion,
      documents: ['./app/**/*.{js,ts,jsx,tsx}'],
      outputDir: './app/types'
    })
  }
};

export default config;
