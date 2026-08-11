import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const demoModule = "virtual:compound-demo-snapshot";
const resolvedDemoModule = `\0${demoModule}`;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const includeDemo = (process.env.VITE_COMPOUND_DEMO_MODE ?? env.VITE_COMPOUND_DEMO_MODE) === "true";
  const demo = includeDemo
    ? JSON.parse(readFileSync(fileURLToPath(new URL("./src/demo/latest.json", import.meta.url)), "utf8")) as unknown
    : null;

  return {
    plugins: [
      react(),
      {
        name: "compound-demo-snapshot",
        resolveId(id) {
          return id === demoModule ? resolvedDemoModule : null;
        },
        load(id) {
          return id === resolvedDemoModule ? `export default ${JSON.stringify(demo)};` : null;
        },
      },
    ],
    build: {
      sourcemap: false,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      restoreMocks: true,
    },
  };
});
