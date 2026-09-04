import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "import", "unicorn", "oxc", "vitest", "node"],
  env: {
    node: true,
  },
  categories: {
    correctness: "error",
    suspicious: "warn",
    perf: "warn",
  },
  rules: {
    eqeqeq: "error",
    "no-var": "error",
    "prefer-const": "error",
    "typescript/no-explicit-any": "error",
    "import/no-cycle": "error",
  },
  overrides: [
    {
      files: ["test/**/*.test.ts", "test/**/*.test-d.ts"],
      env: {
        vitest: true,
      },
      rules: {
        "typescript/no-explicit-any": "off",
      },
    },
  ],
});
