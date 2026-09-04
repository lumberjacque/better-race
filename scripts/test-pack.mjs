import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const tempRoot = join(root, "test", ".tmp-pack");
const consumer = join(root, "test", ".tmp-consumer");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("test:pack must run through npm.");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed.`);
}

function runNpm(args, cwd) {
  run(process.execPath, [npmCli, ...args], cwd);
}

await rm(tempRoot, { recursive: true, force: true });
await rm(consumer, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });

try {
  const packedResult = spawnSync(
    process.execPath,
    [npmCli, "pack", "--json", "--pack-destination", tempRoot],
    { cwd: root, encoding: "utf8" },
  );
  if (packedResult.status !== 0) throw new Error("npm pack failed.");
  const [{ filename }] = JSON.parse(packedResult.stdout);
  const tarball = resolve(tempRoot, filename);

  await mkdir(consumer, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2),
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
          strict: true,
          outDir: "out",
        },
        include: ["*.ts"],
      },
      null,
      2,
    ),
  );

  await cp(join(root, "examples"), consumer, { recursive: true });
  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);
  run(process.execPath, [tsc, "--project", "tsconfig.json"], consumer);

  for (const name of [
    "basic-keyed-result.js",
    "abort-losers.js",
    "external-abort.js",
    "rejection-semantics.js",
  ]) {
    run(process.execPath, [join("out", basename(name))], consumer);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
  await rm(consumer, { recursive: true, force: true });
}
