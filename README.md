# better-race

> A better `Promise.race()` for TypeScript: keyed results, precise narrowing, and optional cooperative cancellation.

[![CI](https://github.com/lumberjacque/better-race/actions/workflows/ci.yml/badge.svg)](https://github.com/lumberjacque/better-race/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/better-race?logo=npm&label=npm&color=cb3837)](https://www.npmjs.com/package/better-race)
[![npm downloads](https://img.shields.io/npm/dw/better-race?logo=npm&label=downloads)](https://www.npmjs.com/package/better-race)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-21c55d?logo=vitest&logoColor=white)](#quality-checks)
[![TypeScript ≥5.4](https://img.shields.io/badge/TypeScript-%E2%89%A55.4-3178c6?logo=typescript&logoColor=white)](#public-types)
[![Node ≥22](https://img.shields.io/badge/Node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](#installation)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/better-race?label=minzipped)](https://bundlephobia.com/package/better-race)
[![license: MIT](https://img.shields.io/github/license/lumberjacque/better-race)](LICENSE)

`ESM-only` · `zero runtime dependencies` · `tree-shakeable` · `AbortSignal`-native

`Promise.race()` tells you the first value that settled. `better-race` also tells you **which task produced it**, while keeping that key and value connected in TypeScript.

```ts
import { race } from "better-race";

const winner = await race({
  cache: () => readCache(),
  api: ({ signal }) => fetchUser({ signal }),
});

if (winner.key === "api") {
  winner.value; // exactly the return type of fetchUser
}
```

## Why?

Native `Promise.race()` returns a value union but drops its source:

```ts
const value = await Promise.race([readCache(), fetchUser()]);
// CachedUser | ApiUser
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

const winner = await race({
  memory: () => memoryCache.get("user-42"),
  replica: ({ signal }) => replicaClient.get("user-42", { signal }),
  primary: ({ signal }) => primaryClient.get("user-42", { signal }),
});
```

The result is inferred as:

```ts
{ key: "memory"; value: MemoryUser }
| { key: "replica"; value: ReplicaUser }
| { key: "primary"; value: PrimaryUser }
```

Narrow the key and TypeScript narrows the value:

```ts
if (winner.key === "memory") {
  winner.value; // MemoryUser
} else if (winner.key === "replica") {
  winner.value; // ReplicaUser
} else {
  winner.value; // PrimaryUser
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
  cache: readCache,
  network: ({ signal }) => fetch("/user", { signal }),
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

## Use cases

- Read from a memory cache, distributed cache, and primary store simultaneously.
- Query independent replicas and return the fastest response.
- Race a preferred endpoint against a fallback endpoint, then abort the fallback.
- Preserve source information for metrics, tracing, or structured logging.
- Write compact TypeScript that narrows the result without hand-written wrapper objects.

## Examples

The executable examples are in [`examples/`](./examples):

- [`basic-keyed-result.ts`](./examples/basic-keyed-result.ts)
- [`abort-losers.ts`](./examples/abort-losers.ts)
- [`external-abort.ts`](./examples/external-abort.ts)
- [`rejection-semantics.ts`](./examples/rejection-semantics.ts)

CI compiles and executes these examples against the packed package, not the source tree.

## Visual semantics

A race is not a dependency graph: every task starts immediately. The important moment is the first settlement.

```text
Race Timeline — cache wins with abortLosers: true

Task       │ 0ms                 72ms                                  400ms
───────────┼─────────────────────┼──────────────────────────────────────────
cache      │ ███████████████████ ● fulfilled winner
api        │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ × abort signal received
replica    │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ × abort signal received
                              ↑
                       first settlement wins

Legend: █ active fulfilled work · ▓ active rejected work · ▒ active work aborted by the race
```

Open [`playground/race-lab.html`](./playground/race-lab.html) directly in a browser to explore an animated version. It contains four concrete scenarios: fulfilment, first rejection, continuing losers, and external abort. The page is a visual prototype, not a shipped package artifact; Vitest and the packed-consumer test verify the runtime contract.

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
