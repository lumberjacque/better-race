# better-race

> A better `Promise.race()` for TypeScript: keyed results, precise narrowing, and optional cooperative cancellation.

[![CI](https://github.com/lumberjacque/better-race/actions/workflows/ci.yml/badge.svg)](https://github.com/lumberjacque/better-race/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/better-race?logo=npm&label=npm&color=cb3837)](https://www.npmjs.com/package/better-race)
[![npm downloads](https://img.shields.io/npm/dw/better-race?logo=npm&label=downloads)](https://www.npmjs.com/package/better-race)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-21c55d?logo=vitest&logoColor=white)](https://github.com/lumberjacque/better-race/actions/workflows/ci.yml)
[![TypeScript ≥5.4](https://img.shields.io/badge/TypeScript-%E2%89%A55.4-3178c6?logo=typescript&logoColor=white)](#public-types)
[![Node ≥22](https://img.shields.io/badge/Node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](#installation)
[![tree-shaken bundle size](https://deno.bundlejs.com/badge?q=better-race&treeshake=%5B%2A%5D)](https://deno.bundlejs.com/?q=better-race&treeshake=%5B%2A%5D)
[![license: MIT](https://img.shields.io/github/license/lumberjacque/better-race)](LICENSE)

`ESM-only` · `zero runtime dependencies` · `tree-shakeable` · `AbortSignal`-native

`Promise.race()` tells you the first value that settled. `better-race` also tells you **which task produced it**, while keeping that key and value connected in TypeScript.

```ts
import { race } from "better-race";

const winner = await race(
  {
    eu: ({ signal }) => fetch("https://eu.example.com/user/42", { signal }),
    us: ({ signal }) => fetch("https://us.example.com/user/42", { signal }),
  },
  { abortLosers: true },
);

if (winner.key === "eu") {
  winner.value; // the Response from the EU replica
}
```

## Why?

Native `Promise.race()` returns a value union but drops its source:

```ts
const value = await Promise.race([readEuReplica(), readUsReplica()]);
// EuUser | UsUser
```

You can restore the source by manually wrapping every promise. `better-race` makes that wrapper the default, preserves the relation as a discriminated union, and can abort cooperative losers when that saves work.

## Installation

```sh
npm install better-race
```

`better-race` is ESM-only, targets ES2022, and supports Node.js 22 or newer. It is framework-agnostic: it uses only promises and the standard `AbortSignal` API.

## `race(tasks, options?)`

Pass an object whose string keys name tasks. A task can return a value, a promise, or any `PromiseLike` value. It receives a context containing an `AbortSignal`, which it may ignore.

```ts
import { race } from "better-race";

const winner = await race(
  {
    eu: ({ signal }) => euReplica.get("user-42", { signal }),
    us: ({ signal }) => usReplica.get("user-42", { signal }),
    apac: ({ signal }) => apacReplica.get("user-42", { signal }),
  },
  { abortLosers: true },
);
```

The result is inferred as:

```ts
{ key: "eu"; value: EuUser }
| { key: "us"; value: UsUser }
| { key: "apac"; value: ApacUser }
```

Narrow the key and TypeScript narrows the value:

```ts
if (winner.key === "eu") {
  winner.value; // EuUser
} else if (winner.key === "us") {
  winner.value; // UsUser
} else {
  winner.value; // ApacUser
}
```

### Semantics

`race()` intentionally follows the mental model of `Promise.race()`.

- Every task starts in object property order before any settlement is processed.
- The first task to settle wins, whether it fulfils or rejects.
- A first rejection rejects with the **original reason**; it is never wrapped.
- A synchronous task result works. A synchronous throw becomes a rejected race.
- `race({})` is rejected at the call site with a clear `TypeError`; TypeScript also rejects it.
- Only own, enumerable string keys are considered.

There is no priority system. Property order defines predictable startup order only—not a tie-breaker.

### Optional loser cancellation

By default, losers keep running, exactly like `Promise.race()`:

```ts
const winner = await race({
  eu: ({ signal }) => fetch("https://eu.example.com/user/42", { signal }),
  us: ({ signal }) => fetch("https://us.example.com/user/42", { signal }),
});
```

Set `abortLosers: true` to abort every still-running loser after the first settlement, including when the winning task rejects:

```ts
const winner = await race(
  {
    primary: ({ signal }) => fetch("/primary", { signal }),
    backup: ({ signal }) => fetch("/backup", { signal }),
  },
  { abortLosers: true },
);
```

Cancellation is cooperative. Passing a signal does not magically stop synchronous CPU work or code that ignores it. `fetch`, many database clients, and your own signal-aware functions can react to it.

The winning task's signal is never aborted by `abortLosers`.

### External cancellation

Pass a caller-owned signal to stop a pending race:

```ts
const controller = new AbortController();

const winner = await race(
  {
    primary: ({ signal }) => fetch("/primary", { signal }),
    backup: ({ signal }) => fetch("/backup", { signal }),
  },
  { signal: controller.signal, abortLosers: true },
);

controller.abort(new Error("User navigated away"));
```

If the external signal is already aborted, no task starts. If it aborts while the race is pending, every task signal is aborted and the returned promise rejects with the exact `signal.reason`.

Once a task wins, the external listener is removed. With the default `abortLosers: false`, an external abort later does **not** retroactively cancel a loser that was deliberately allowed to continue.

### Options

```ts
interface RaceOptions {
  signal?: AbortSignal;
  abortLosers?: boolean; // false by default
}
```

### Public types

```ts
import type { RaceContext, RaceOptions, RaceResult, RaceTask, RaceTasks } from "better-race";
```

`RaceContext` deliberately contains only `signal`. There are no framework adapters, schedulers, retries, timeouts, hooks, or hidden global state.

## `raceUntil(tasks, options)`

`raceUntil()` starts every task concurrently, but settles only when a fulfilled value passes `accept`. It is for “first usable result” cases where an early `null`, stale response, or unsuitable value should not end the race. It is not a replacement for a normal cache-first lookup: use it only when starting every candidate is an intentional latency or resilience trade-off.

### Keyed, cancellable `Promise.any()`

Use an always-accepting predicate when the first fulfilled result should win. In
that mode, `raceUntil()` is a keyed, cancellable alternative to `Promise.any()`:
rejections are skipped while another task can still fulfil, and the winner keeps
its task key.

```ts
const winner = await raceUntil(
  {
    cache: () => readCache(),
    api: ({ signal }) => fetchUser({ signal }),
  },
  { accept: () => true, abortLosers: true },
);

if (winner.key === "api") {
  winner.value; // User
}
```

If every task rejects, `raceUntil()` rejects with `NoAcceptedResultError`, which
extends `AggregateError`. Unlike native `Promise.any()`, its `rejections`
property retains each task key alongside the original rejection reason.

```ts
import { raceUntil } from "better-race";

type User = { id: string };

const winner = await raceUntil(
  {
    memory: () => memoryCache.get("user-42"), // User | null
    redis: () => redisCache.get("user-42"), // User | null
    database: ({ signal }) => fetchUser("user-42", { signal }), // User
  },
  {
    accept: (value): value is User => value !== null,
    abortLosers: true,
  },
);

winner.key; // "memory" | "redis" | "database"
winner.value; // User
```

### Semantics

- All tasks start in object property order before any fulfilment, rejection, or acceptance is processed.
- A fulfilled value for which `accept(value)` is `false` is declined; pending tasks keep racing.
- A task rejection is recorded and ignored while another task could still provide an accepted value.
- The first accepted value wins. With `abortLosers: true`, every pending loser receives an abort signal; otherwise it keeps running.
- If every task settles without an accepted value, `raceUntil()` rejects with `NoAcceptedResultError`.
- If `accept` throws, `raceUntil()` rejects with that exact error. External abort behaves exactly like `race()` and aborts all pending tasks with the caller’s original `signal.reason`.

`NoAcceptedResultError` extends `AggregateError`. Its `errors` array retains original rejection reasons, and its `rejections` property keeps each reason coupled to the task key:

```ts
try {
  await raceUntil(tasks, { accept: isUsable });
} catch (error) {
  if (error instanceof NoAcceptedResultError) {
    error.rejections; // readonly { key: string; reason: unknown }[]
  }
}
```

### Type narrowing

Use an explicit type predicate when the result must be narrowed on TypeScript 5.4 and newer:

```ts
accept: (value): value is User => value !== null;
```

A plain boolean callback is always valid, but preserves each task’s original value type. The keyed relationship remains intact in both forms.

### Public types

```ts
import {
  NoAcceptedResultError,
  raceUntil,
  type RaceUntilOptions,
  type RaceUntilRejection,
  type RaceUntilResult,
} from "better-race";
```

## Use cases

- Query independent read replicas when lower tail latency is worth redundant read work.
- Query independent replicas and return the fastest response.
- Race a preferred endpoint against a fallback endpoint, then abort the fallback.
- Preserve source information for metrics, tracing, or structured logging.
- Write compact TypeScript that narrows the result without hand-written wrapper objects.
- Query several stores in parallel until one returns a usable, non-null record.

## Examples

The executable examples are in [`examples/`](./examples):

- [`basic-keyed-result.ts`](./examples/basic-keyed-result.ts)
- [`abort-losers.ts`](./examples/abort-losers.ts)
- [`external-abort.ts`](./examples/external-abort.ts)
- [`rejection-semantics.ts`](./examples/rejection-semantics.ts)
- [`until-accepted-result.ts`](./examples/until-accepted-result.ts)

CI compiles and executes these examples against the packed package, not the source tree.

## Visual semantics

A race is not a dependency graph: every task starts immediately. The important moment is the first settlement.

```text
Race Timeline — EU replica wins with abortLosers: true

Task       │ 0ms                 72ms                                  400ms
───────────┼─────────────────────┼──────────────────────────────────────────
eu         │ ███████████████████ ● fulfilled winner
us         │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ × abort signal received
apac       │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ × abort signal received
                              ↑
                       first settlement wins

Legend: █ active fulfilled work · ▓ active rejected work · ▒ active work aborted by the race
```

`raceUntil()` keeps the same concurrent start, but the line marks the first **accepted** value rather than the first settlement:

```text
RaceUntil Timeline — wait for an accepted result

Task       │ Outcome          │ Decision                    │ Timeline
───────────┼──────────────────┼─────────────────────────────┼────────────────────────────────────
memory     │ null @ 24ms      │ accept → false · decline    │ ███ ▧ declined
redis      │ Error @ 68ms     │ record rejection · continue │ ████████ ▓ recorded
database   │ User @ 176ms     │ accept → true · winner      │ ██████████████████████ ● accepted
backup     │ pending @ 176ms  │ abortLosers → abort          │ ██████████████████████ ▒ cancelled

Legend: █ active task work · ▧ fulfilled candidate declined by accept · ▓ recorded rejection · ● accepted winner · ▒ cancelled loser
```

Open [`playground/race-lab.html`](./playground/race-lab.html) directly in a browser to explore an animated version. It contains concrete `race()` and `raceUntil()` scenarios; the page is a visual prototype, not a shipped package artifact. Vitest and the packed-consumer test verify the runtime contract.

## Quality checks

The [CI workflow](https://github.com/lumberjacque/better-race/actions/workflows/ci.yml) runs the V8 coverage report on Node 22, 24, and 26. The configured threshold is exactly 100% for statements, branches, functions, and lines, so a green CI run is a verifiable guarantee rather than a decorative badge. Open the latest `Node 22` job to inspect its full report.

## Development

```sh
npm install
npm run verify
```

`verify` runs formatting, linting, typechecking, 100% runtime coverage, type tests, a production build, and a packed-consumer test.

Useful commands:

```sh
npm run format        # Format source with oxfmt
npm run lint          # Lint with oxlint
npm run test:coverage # Runtime tests with strict 100% coverage
npm run test:types    # Compile-time inference tests
npm run build         # ESM package and declaration output
npm run test:pack     # Test the tarball from a clean consumer
```

Husky runs formatting for staged files plus typechecking and tests before commits. Commit messages use the Conventional Commits specification.

## Contributing and security

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md). This project is released under the [MIT License](./LICENSE).
