export type FailureKind = 'user-error' | 'graphql-error' | 'network';

export interface Failure {
  ok: false;
  kind: FailureKind;
  message: string;
  field?: string[];
}

export type Success<T> = { ok: true } & T;

/** The outcome of an Admin API call: the success payload, or a typed failure. Nothing is thrown. */
export type Result<T> = Success<T> | Failure;
