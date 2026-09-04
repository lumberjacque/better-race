import { describe, expect, it, vi } from "vitest";

import { NoAcceptedResultError, raceUntil } from "../src/index.js";
import { createDeferred } from "./helpers.js";

describe("raceUntil", () => {
  it("returns the first accepted result and keeps its key", async () => {
    const cache = createDeferred<string | null>();
    const api = createDeferred<string>();
    const result = raceUntil(
      { cache: () => cache.promise, api: () => api.promise },
      { accept: (value): value is string => value !== null },
    );

    cache.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    api.resolve("fresh user");

    await expect(result).resolves.toEqual({ key: "api", value: "fresh user" });
  });

  it("starts every task before it handles a synchronous accepted result", async () => {
    const started: string[] = [];
    const result = raceUntil(
      {
        first: () => {
          started.push("first");
          return "winner";
        },
        second: () => {
          started.push("second");
          return "later";
        },
      },
      { accept: () => true },
    );

    await expect(result).resolves.toEqual({ key: "first", value: "winner" });
    expect(started).toEqual(["first", "second"]);
  });

  it("ignores rejected tasks while another task can still be accepted", async () => {
    const rejected = createDeferred<never>();
    const accepted = createDeferred<string>();
    const reason = new Error("replica unavailable");
    const result = raceUntil(
      { replica: () => rejected.promise, primary: () => accepted.promise },
      { accept: () => true },
    );

    rejected.reject(reason);
    accepted.resolve("user");

    await expect(result).resolves.toEqual({ key: "primary", value: "user" });
  });

  it("rejects with details when no value is accepted", async () => {
    const rejected = createDeferred<never>();
    const result = raceUntil(
      { cache: () => null, replica: () => rejected.promise },
      { accept: (value) => value !== null },
    );
    const reason = new Error("replica unavailable");

    rejected.reject(reason);

    await expect(result).rejects.toMatchObject({
      name: "NoAcceptedResultError",
      message: "raceUntil() completed without an accepted result.",
      rejections: [{ key: "replica", reason }],
    });
  });

  it("keeps working tasks alive by default after an accepted result", async () => {
    const slow = createDeferred<string>();
    let slowSignal: AbortSignal | undefined;
    const result = raceUntil(
      {
        fast: () => "accepted",
        slow: ({ signal }) => {
          slowSignal = signal;
          return slow.promise;
        },
      },
      { accept: () => true },
    );

    await expect(result).resolves.toEqual({ key: "fast", value: "accepted" });
    expect(slowSignal?.aborted).toBe(false);
    slow.reject(new Error("late"));
    await Promise.resolve();
  });

  it("aborts only remaining losers after an accepted result when enabled", async () => {
    const slow = createDeferred<string>();
    let winnerSignal: AbortSignal | undefined;
    let slowSignal: AbortSignal | undefined;
    const result = raceUntil(
      {
        winner: ({ signal }) => {
          winnerSignal = signal;
          return "accepted";
        },
        slow: ({ signal }) => {
          slowSignal = signal;
          return slow.promise;
        },
      },
      { accept: () => true, abortLosers: true },
    );

    await expect(result).resolves.toEqual({ key: "winner", value: "accepted" });
    expect(winnerSignal?.aborted).toBe(false);
    expect(slowSignal?.aborted).toBe(true);
    slow.reject(new Error("late"));
    await Promise.resolve();
  });

  it("does not start tasks when the external signal is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const task = vi.fn(() => "never");
    controller.abort(reason);

    await expect(
      raceUntil({ task }, { accept: () => true, signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(task).not.toHaveBeenCalled();
  });

  it("aborts all running tasks when the external signal aborts", async () => {
    const controller = new AbortController();
    const pending = createDeferred<string>();
    const reason = new Error("cancelled");
    let taskSignal: AbortSignal | undefined;
    const result = raceUntil(
      {
        task: ({ signal }) => {
          taskSignal = signal;
          return pending.promise;
        },
      },
      { accept: () => true, signal: controller.signal },
    );

    await Promise.resolve();
    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
    expect(taskSignal?.aborted).toBe(true);
    pending.resolve("late");
    await Promise.resolve();
  });

  it("rejects with the original error when accept throws", async () => {
    const reason = new Error("invalid accept function");

    await expect(
      raceUntil(
        { value: () => "value" },
        {
          accept: () => {
            throw reason;
          },
        },
      ),
    ).rejects.toBe(reason);
  });

  it("rejects invalid runtime input before starting a task", () => {
    const task = vi.fn(() => "never");

    expect(() =>
      raceUntil({ task, invalid: "not a task" } as unknown as { task: typeof task }, {
        accept: () => true,
      }),
    ).toThrow(TypeError);
    expect(task).not.toHaveBeenCalled();
  });

  it("rejects when the only fulfilled value is not accepted", async () => {
    await expect(raceUntil({ cache: () => null }, { accept: () => false })).rejects.toBeInstanceOf(
      NoAcceptedResultError,
    );
  });
  it("throws a clear error for an empty task object", () => {
    expect(() => raceUntil({} as never, { accept: () => true })).toThrow(
      "raceUntil() requires at least one task.",
    );
  });
});
