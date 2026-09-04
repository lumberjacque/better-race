import { expectTypeOf, test } from "vitest";

import { raceUntil } from "../src/index.js";

type User = { readonly id: string };

test("preserves keys and narrows values with an accept type predicate", async () => {
  const result = await raceUntil(
    {
      cache: () => null as User | null,
      api: () => ({ id: "42" }) as User,
    },
    { accept: (value): value is User => value !== null },
  );

  if (result.key === "cache") {
    expectTypeOf(result.value).toEqualTypeOf<User>();
  } else {
    expectTypeOf(result.value).toEqualTypeOf<User>();
  }
});

test("keeps original values when accept is a boolean callback", async () => {
  const result = await raceUntil(
    { cache: () => null as string | null, api: () => "user" },
    { accept: (value): boolean => value !== null },
  );

  if (result.key === "cache") {
    expectTypeOf(result.value).toEqualTypeOf<string | null>();
  } else {
    expectTypeOf(result.value).toEqualTypeOf<string>();
  }
});

test("rejects an empty task object", () => {
  // @ts-expect-error An empty raceUntil is never useful.
  raceUntil({}, { accept: () => true });
});
