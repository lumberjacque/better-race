import { NoAcceptedResultError, type RaceUntilRejection } from "./errors.js";
import type {
  NonEmptyTasks,
  RaceContext,
  RaceResult,
  RaceTask,
  RaceTasks,
  RaceUntilOptions,
  RaceUntilResult,
  RaceValue,
} from "./types.js";

type TaskEntry<T extends RaceTasks> = readonly [Extract<keyof T, string>, RaceTask<unknown>];

type TypeGuardOptions<TValue, Accepted extends TValue> = RaceUntilOptions<TValue> & {
  readonly accept: (value: TValue) => value is Accepted;
};

/**
 * Races named tasks until a fulfilled value is accepted.
 *
 * Every task starts in object property order before any settlement is
 * processed. Fulfilled values that `accept` rejects and task rejections are
 * ignored while pending tasks remain. The first accepted value resolves with
 * its keyed result. When every task settles without an accepted value, the
 * promise rejects with {@link NoAcceptedResultError}.
 *
 * A type-predicate `accept` function narrows each keyed value in the result.
 * Set `abortLosers` to abort cooperative pending tasks after acceptance; pass
 * `signal` to cancel the whole pending race externally.
 *
 * @throws {TypeError} When `tasks` is empty or contains a non-function value.
 * @throws {NoAcceptedResultError} When no fulfilled value is accepted.
 */
export function raceUntil<const T extends RaceTasks, Accepted extends RaceValue<T>>(
  tasks: NonEmptyTasks<T>,
  options: TypeGuardOptions<RaceValue<T>, Accepted>,
): Promise<RaceUntilResult<T, Accepted>>;
export function raceUntil<const T extends RaceTasks>(
  tasks: NonEmptyTasks<T>,
  options: RaceUntilOptions<RaceValue<T>>,
): Promise<RaceResult<T>>;
export function raceUntil<const T extends RaceTasks>(
  tasks: NonEmptyTasks<T>,
  options: RaceUntilOptions<RaceValue<T>>,
): Promise<RaceResult<T>> {
  const entries = Object.entries(tasks) as unknown as TaskEntry<T>[];

  if (entries.length === 0) {
    throw new TypeError("raceUntil() requires at least one task.");
  }

  for (const [key, task] of entries) {
    if (typeof task !== "function") {
      throw new TypeError(`raceUntil() task "${key}" must be a function.`);
    }
  }

  if (options.signal?.aborted) {
    return Promise.reject(options.signal.reason);
  }

  const controllers = new Map<string, AbortController>(
    entries.map(([key]) => [key, new AbortController()]),
  );

  return new Promise<RaceResult<T>>((resolve, reject) => {
    let settled = false;
    let remaining = entries.length;
    const rejections: RaceUntilRejection[] = [];

    const cleanup = (): void => {
      options.signal?.removeEventListener("abort", onExternalAbort);
    };

    const abortTasks = (winnerKey?: string): void => {
      for (const [key, controller] of controllers) {
        if (key !== winnerKey) controller.abort();
      }
    };

    const settleAccepted = (key: string, value: unknown): void => {
      settled = true;
      cleanup();
      if (options.abortLosers) abortTasks(key);
      resolve({ key, value } as RaceResult<T>);
    };

    const settleFailure = (reason: unknown): void => {
      settled = true;
      cleanup();
      reject(reason);
    };

    const settleWithoutAcceptedValue = (): void => {
      settled = true;
      cleanup();
      reject(new NoAcceptedResultError(rejections));
    };

    const onExternalAbort = (): void => {
      settled = true;
      cleanup();
      abortTasks();
      reject(options.signal?.reason);
    };

    options.signal?.addEventListener("abort", onExternalAbort, { once: true });

    for (const [key, task] of entries) {
      const controller = controllers.get(key)!;
      const context: RaceContext = { signal: controller.signal };

      Promise.resolve()
        .then(() => task(context))
        .then(
          (value) => {
            if (settled) return;

            try {
              if (options.accept(value as RaceValue<T>)) {
                settleAccepted(key, value);
                return;
              }
            } catch (reason) {
              settleFailure(reason);
              return;
            }

            remaining -= 1;
            if (remaining === 0) settleWithoutAcceptedValue();
          },
          (reason: unknown) => {
            if (settled) return;

            rejections.push({ key, reason });
            remaining -= 1;
            if (remaining === 0) settleWithoutAcceptedValue();
          },
        );
    }
  });
}
