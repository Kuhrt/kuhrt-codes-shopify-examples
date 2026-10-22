export type Variables = Record<string, unknown>;

/** Runs one named GraphQL operation against a store and returns the response `data`. */
export type Executor<Operation extends string = string> = (
  operation: Operation,
  variables: Variables
) => Promise<unknown>;
