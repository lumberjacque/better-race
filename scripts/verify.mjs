import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("verify must run through npm.");

const scripts = [
  "format:check",
  "lint:ci",
  "typecheck",
  "test:coverage",
  "test:types",
  "build",
  "test:pack",
];

for (const script of scripts) {
  const result = spawnSync(process.execPath, [npmCli, "run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
