import { describe, expect, it, vi } from "vitest";

import { race } from "../src/index.js";
import { createDeferred } from "./helpers.js";

describe("race", () => {
  it("returns the first fulfilled task with its key", async () => {
    const cache = createDeferred<string>();
    const api = createDeferred<number>();
    const result = race({ cache: () => cache.promise, api: () => api.promise });

    api.resolve(200);

    await expect(result).resolves.toEqual({ key: "api", value: 200 });
  });

  it("rejects with the original reason from the first rejected task", async () => {
    const first = createDeferred<never>();
    const second = createDeferred<string>();
    const reason = new Error("unavailable");
    const result = race({ first: () => first.promise, second: () => second.promise });

    first.reject(reason);

    await expect(result).rejects.toBe(reason);
  });

  it("starts every task before it handles a synchronous winner", async () => {
    const started: string[] = [];
    const result = race({
      first: () => {
        started.push("first");
        return "winner";
      },
      second: () => {
        started.push("second");
        return "loser";
      },
    });

    await expect(result).resolves.toEqual({ key: "first", value: "winner" });
    expect(started).toEqual(["first", "second"]);
  });

  it("normalizes a synchronous throw while still starting every task", async () => {
    const started: string[] = [];
    const reason = new Error("boom");
    const result = race({
      first: () => {
        started.push("first");
        throw reason;
      },
      second: () => {
        started.push("second");
        return "later";
      },
    });

    await expect(result).rejects.toBe(reason);
    expect(started).toEqual(["first", "second"]);
  });

  it("leaves losers running by default", async () => {
    const slow = createDeferred<string>();
    let slowSignal: AbortSignal | undefined;
    const result = race({
      fast: () => "fast",
      slow: ({ signal }) => {
        slowSignal = signal;
        return slow.promise;
      },
    });

    await expect(result).resolves.toEqual({ key: "fast", value: "fast" });
    expect(slowSignal?.aborted).toBe(false);
    slow.resolve("slow");
  });

  it("aborts only losers when abortLosers is enabled", async () => {
    const slow = createDeferred<string>();
    let fastSignal: AbortSignal | undefined;
    let slowSignal: AbortSignal | undefined;
    const result = race(
      {
        fast: ({ signal }) => {
          fastSignal = signal;
          return "fast";
        },
        slow: ({ signal }) => {
          slowSignal = signal;
          return slow.promise;
        },
      },
      { abortLosers: true },
    );

    await expect(result).resolves.toEqual({ key: "fast", value: "fast" });
    expect(fastSignal?.aborted).toBe(false);
    expect(slowSignal?.aborted).toBe(true);
    slow.resolve("slow");
  });

  it("does not start tasks when the external signal is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const task = vi.fn(() => "never");
    controller.abort(reason);

    await expect(race({ task }, { signal: controller.signal })).rejects.toBe(reason);
    expect(task).not.toHaveBeenCalled();
  });

  it("aborts all running tasks and preserves an external abort reason", async () => {
    const controller = new AbortController();
    const pending = createDeferred<string>();
    const reason = new Error("cancelled");
    let taskSignal: AbortSignal | undefined;
    const result = race(
      {
        task: ({ signal }) => {
          taskSignal = signal;
          return pending.promise;
        },
      },
      { signal: controller.signal },
    );

    await Promise.resolve();
    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
    expect(taskSignal?.aborted).toBe(true);
    pending.resolve("late");
  });

  it("detaches the external signal after a winner settles", async () => {
    const controller = new AbortController();
    const slow = createDeferred<string>();
    let slowSignal: AbortSignal | undefined;
    const result = race(
      {
        fast: () => "fast",
        slow: ({ signal }) => {
          slowSignal = signal;
          return slow.promise;
        },
      },
      { signal: controller.signal },
    );

    await expect(result).resolves.toEqual({ key: "fast", value: "fast" });
    controller.abort();

    expect(slowSignal?.aborted).toBe(false);
    slow.resolve("slow");
  });

  it("handles late rejections and cancels losers after a rejected winner", async () => {
    const rejectedWinner = createDeferred<never>();
    const slow = createDeferred<string>();
    const lateReason = new Error("late");
    let slowSignal: AbortSignal | undefined;
    const rejectedRace = race(
      {
        rejectedWinner: () => rejectedWinner.promise,
        slow: ({ signal }) => {
          slowSignal = signal;
          return slow.promise;
        },
      },
      { abortLosers: true },
    );

    rejectedWinner.reject(new Error("first"));

    await expect(rejectedRace).rejects.toThrow("first");
    expect(slowSignal?.aborted).toBe(true);
    slow.reject(lateReason);
    await Promise.resolve();
  });

  it("ignores a rejection that arrives after a fulfilled winner", async () => {
    const late = createDeferred<never>();
    const result = race({ winner: () => "done", late: () => late.promise });

    await expect(result).resolves.toEqual({ key: "winner", value: "done" });
    late.reject(new Error("late"));
    await Promise.resolve();
  });
  it("rejects invalid runtime input before starting any task", () => {
    const task = vi.fn(() => "never");

    expect(() => race({ task, invalid: "not a task" } as unknown as { task: typeof task })).toThrow(
      TypeError,
    );
    expect(task).not.toHaveBeenCalled();
  });

  it("throws a clear error for an empty task object", () => {
    expect(() => race({} as never)).toThrow("race() requires at least one task.");
  });
});
