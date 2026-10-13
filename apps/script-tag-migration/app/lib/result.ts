interface UserErrorFailure {
  ok: false;
  kind: 'user-error';
  message: string;
  field?: string[];
}

interface HttpFailure {
  ok: false;
  kind: 'http';
  status: number;
  message: string;
}

interface OtherFailure {
  ok: false;
  kind: 'graphql-error' | 'network';
  message: string;
}

export type Failure = UserErrorFailure | HttpFailure | OtherFailure;

export type FailureKind = Failure['kind'];

export type Success<T> = { ok: true } & T;

/**
 * The outcome of an Admin API call: the success payload, or a typed failure. Nothing is thrown.
 * `http` means Shopify answered with a non-2xx status, which the failure carries. `network` means
 * no usable answer arrived.
 */
export type Result<T> = Success<T> | Failure;
