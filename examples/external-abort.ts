import { race } from "better-race";
import { delayedValue } from "./helpers.js";

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("Timed out")), 500);

try {
  const winner = await race(
    {
      primary: ({ signal }) => delayedValue("primary response", 1_000, signal),
      backup: ({ signal }) => delayedValue("backup response", 1_000, signal),
    },
    { signal: controller.signal, abortLosers: true },
  );

  console.log(winner.key);
} catch (error) {
  console.log(`Race cancelled: ${(error as Error).message}`);
} finally {
  clearTimeout(timeout);
}
