import { execFileSync, spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("publish must run through npm.");

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (status.trim()) {
  throw new Error(
    "Refusing to publish with uncommitted changes. Run npm run version and commit first.",
  );
}

const verification = spawnSync(process.execPath, [npmCli, "run", "verify"], { stdio: "inherit" });
if (verification.status !== 0) process.exit(verification.status ?? 1);

const publish = spawnSync(process.execPath, [npmCli, "publish", "--access", "public"], {
  stdio: "inherit",
});
process.exit(publish.status ?? 1);
