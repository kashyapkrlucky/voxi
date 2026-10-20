import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Agent evals call the real OpenAI API, so they're kept out of `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    setupFiles: ["dotenv/config"],
    testTimeout: 90_000,
    fileParallelism: false,
  },
});
