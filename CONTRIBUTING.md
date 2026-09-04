# Contributing

Thanks for improving `better-race`.

## Local setup

Use Node.js 22 or newer and npm:

```sh
npm install
npm run verify
```

Keep changes focused. Public runtime behaviour needs a runtime test, and public inference behaviour needs a type test in `test/*.test-d.ts`.

## Commit messages

Commits follow Conventional Commits, for example:

```text
feat: add external abort support
fix: preserve a rejection reason
```

Husky checks formatting, types, and runtime tests locally. CI also checks the built tarball from a clean consumer.

## Pull requests

Explain the behaviour change, include examples when users would benefit, and add a Changeset for user-visible changes. Do not add framework adapters or unrelated async features: the package deliberately stays a small `Promise.race()` utility.
