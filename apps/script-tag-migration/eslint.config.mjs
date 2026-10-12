import preset from '@repo/config/eslint-preset';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...preset,
  { ignores: ['app/types/**', 'extensions/*/assets/**', 'public/legacy/**'] },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, shopify: 'readonly' }
    }
  },
  reactHooks.configs.flat.recommended
];
