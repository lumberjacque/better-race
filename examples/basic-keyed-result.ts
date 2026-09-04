import { race } from "better-race";

const winner = await race(
  {
    eu: async () => ({ region: "eu" as const, id: "user-42" }),
    us: async () => ({ region: "us" as const, id: "user-42" }),
  },
  { abortLosers: true },
);

console.log(`The ${winner.key.toUpperCase()} replica responded for ${winner.value.id}.`);
