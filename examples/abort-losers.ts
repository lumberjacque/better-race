import { race } from "better-race";
import { delayedValue } from "./helpers.js";

const winner = await race(
  {
    primary: ({ signal }) => delayedValue("primary response", 10, signal),
    backup: ({ signal }) => delayedValue("backup response", 100, signal),
  },
  { abortLosers: true },
);

console.log(`The ${winner.key} task won.`);
