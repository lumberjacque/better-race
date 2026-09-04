import { race } from "better-race";

try {
  await race({
    unavailable: () => Promise.reject(new Error("Service unavailable")),
    slowerSuccess: () => new Promise((resolve) => setTimeout(() => resolve("ok"), 50)),
  });
} catch (error) {
  // The first settlement was a rejection, just like Promise.race().
  console.log(`Race rejected as expected: ${(error as Error).message}`);
}
