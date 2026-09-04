/** Context supplied to every task in a race. */
export interface RaceContext {
  /**
   * A signal that is aborted when the caller cancels a pending race or, when
   * enabled, when another task settles first.
   */
  readonly signal: AbortSignal;
}

/** A synchronous or asynchronous operation that participates in a race. */
export type RaceTask<T> = (context: RaceContext) => T | PromiseLike<T>;

/** A named collection of tasks accepted by {@link race}. */
export type RaceTasks = Readonly<Record<string, RaceTask<unknown>>>;

/** Options that control cancellation for {@link race}. */
export interface RaceOptions {
  /**
   * Cancels every still-running task while the race is pending. The race
   * rejects with this signal's reason. Once a task wins, this signal is
   * detached and can no longer affect continuing losers.
   */
  readonly signal?: AbortSignal;

  /**
   * Abort still-running losers when the first task settles. Defaults to
   * `false`, matching the non-cancelling behaviour of `Promise.race()`.
   */
  readonly abortLosers?: boolean;
}

type StringKeyOf<T> = Extract<keyof T, string>;

/**
 * The discriminated union returned by {@link race}. Narrowing `key` narrows
 * `value` to the exact value type returned by that task.
 */
export type RaceResult<T extends RaceTasks> = {
  [K in StringKeyOf<T>]: {
    readonly key: K;
    readonly value: Awaited<ReturnType<T[K]>>;
  };
}[StringKeyOf<T>];

/** @internal Rejects an empty object at compile time. */
export type NonEmptyTasks<T extends RaceTasks> = keyof T extends never ? never : T;
