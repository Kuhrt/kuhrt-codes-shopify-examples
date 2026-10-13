import type { Failure } from '../lib/result';

export interface OwnedScriptTag {
  id: string;
  src: string;
  displayScope: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export const STEP = {
  listScriptTags: 'list-script-tags',
  deleteScriptTag: 'delete-script-tag'
} as const;

export type Step = (typeof STEP)[keyof typeof STEP];

export const INTENT = { delete: 'delete' } as const;

export const FIELD = { intent: 'intent', id: 'id' } as const;

export interface StepFailure {
  ok: false;
  step: Step;
  failure: Failure;
}

export type ScriptTagsState = { ok: true; tags: OwnedScriptTag[] } | StepFailure;

export interface ConsoleLoaderData {
  clientId: string;
  storeHandle: string;
  scriptTags: ScriptTagsState;
}

export type ConsoleActionData = { ok: true; deletedId: string } | StepFailure;
