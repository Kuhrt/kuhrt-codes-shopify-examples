import { fileURLToPath } from 'node:url';

/** Maps an operation name to the `<operation>.graphql` file next to the module at `moduleUrl`. */
export function graphqlFileResolver<Operation extends string>(moduleUrl: string | URL) {
  return (operation: Operation): string =>
    fileURLToPath(new URL(`./${operation}.graphql`, moduleUrl));
}
