import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["dotenv/config"],
    // Repo tests share one Postgres; run files one at a time.
    fileParallelism: false,
  },
});
