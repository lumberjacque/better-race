import { race } from "better-race";

const winner = await race({
  cache: () => ({ kind: "cached" as const, ageMs: 20 }),
  api: async () => ({ kind: "remote" as const, id: "user-42" }),
});

if (winner.key === "cache") {
  console.log(`Using a ${winner.value.kind} value (${winner.value.ageMs}ms old).`);
} else {
  console.log(`Fetched ${winner.value.id} from the API.`);
}
