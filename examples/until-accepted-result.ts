import { raceUntil } from "better-race";

import { delayedValue } from "./helpers.js";

type User = { readonly id: string; readonly source: "database" };

const winner = await raceUntil(
  {
    memory: ({ signal }) => delayedValue<User | null>(null, 12, signal),
    redis: ({ signal }) => delayedValue<User | null>(null, 36, signal),
    database: ({ signal }) => delayedValue<User>({ id: "user-42", source: "database" }, 88, signal),
  },
  {
    accept: (value): value is User => value !== null,
    abortLosers: true,
  },
);

console.log(`Accepted ${winner.value.id} from ${winner.key}.`);
