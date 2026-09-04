import { expectTypeOf, test } from "vitest";

import { race } from "../src/index.js";

test("preserves the key-to-value relationship", async () => {
  const result = await race({
    cache: () => ({ cached: true as const }),
    api: async () => ({ id: 42, source: "api" as const }),
  });

  if (result.key === "cache") {
    expectTypeOf(result.value).toEqualTypeOf<{ cached: true }>();
  } else {
    expectTypeOf(result.value).toEqualTypeOf<{ id: number; source: "api" }>();
  }
});

test("accepts tasks that ignore their context", () => {
  const result = race({ value: () => 1 });
  expectTypeOf<Awaited<typeof result>>().toEqualTypeOf<{
    readonly key: "value";
    readonly value: number;
  }>();
});

test("rejects an empty task object", () => {
  // @ts-expect-error An empty race is never useful.
  race({});
});
