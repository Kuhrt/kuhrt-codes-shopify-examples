import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Whether the module at `moduleUrl` is the script node was started with. */
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined) return false;
  return resolve(argv1) === resolve(fileURLToPath(moduleUrl));
}
