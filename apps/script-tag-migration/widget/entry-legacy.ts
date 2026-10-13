import { mountLegacy } from './mount';

const script = document.currentScript;
mountLegacy(document, script instanceof HTMLScriptElement ? script.src : undefined);
