import type {
  NonEmptyTasks,
  RaceContext,
  RaceOptions,
  RaceResult,
  RaceTask,
  RaceTasks,
} from "./types.js";

type TaskEntry<T extends RaceTasks> = readonly [Extract<keyof T, string>, RaceTask<unknown>];

/**
 * Races named tasks and returns both the first settled task's key and value.
 *
 * All tasks are started in object property order before any settlement is
 * processed. The first task to fulfil resolves with its keyed result; the
 * first task to reject rejects with its original reason, just like
 * `Promise.race()`.
 *
 * Set `abortLosers` to abort cooperative losers after the race settles. Pass
 * `signal` to cancel a still-pending race externally. A task must use the
 * supplied `AbortSignal` for cancellation to stop its underlying work.
 *
 * @example
 * ```ts
 * const winner = await race({
 *   cache: () => readCache(),
 *   api: ({ signal }) => fetchUser({ signal }),
 * });
 *
 * if (winner.key === "api") {
 *   winner.value; // inferred from fetchUser
 * }
 * ```
 *
 * @throws {TypeError} When `tasks` is empty or contains a non-function value.
 */
export function race<const T extends RaceTasks>(
  tasks: NonEmptyTasks<T>,
  options: RaceOptions = {},
): Promise<RaceResult<T>> {
  const entries = Object.entries(tasks) as unknown as TaskEntry<T>[];

  if (entries.length === 0) {
    throw new TypeError("race() requires at least one task.");
  }

  for (const [key, task] of entries) {
    if (typeof task !== "function") {
      throw new TypeError(`race() task "${key}" must be a function.`);
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

    const cleanup = (): void => {
      options.signal?.removeEventListener("abort", onExternalAbort);
    };

    const abortTasks = (winnerKey?: string): void => {
      for (const [key, controller] of controllers) {
        if (key !== winnerKey) {
          controller.abort();
        }
      }
    };

    const settleFulfilled = (key: string, value: unknown): void => {
      if (settled) return;

      settled = true;
      cleanup();
      if (options.abortLosers) abortTasks(key);
      resolve({ key, value } as RaceResult<T>);
    };

    const settleRejected = (key: string, reason: unknown): void => {
      if (settled) return;

      settled = true;
      cleanup();
      if (options.abortLosers) abortTasks(key);
      reject(reason);
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
          (value) => settleFulfilled(key, value),
          (reason: unknown) => settleRejected(key, reason),
        );
    }
  });
}
