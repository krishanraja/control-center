import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const demoModule = "virtual:compound-demo-snapshot";
const resolvedDemoModule = `\0${demoModule}`;
const demoPropertyModule = "virtual:compound-demo-property";
const resolvedDemoPropertyModule = `\0${demoPropertyModule}`;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const includeDemo = (process.env.VITE_COMPOUND_DEMO_MODE ?? env.VITE_COMPOUND_DEMO_MODE) === "true";
  const demo = includeDemo
    ? JSON.parse(readFileSync(fileURLToPath(new URL("./src/demo/latest.json", import.meta.url)), "utf8")) as unknown
    : null;
  const demoProperty = includeDemo
    ? JSON.parse(readFileSync(fileURLToPath(new URL("./src/demo/property.json", import.meta.url)), "utf8")) as unknown
    : null;

  return {
    server: {
      host: true,
      allowedHosts: [".vercel.run"],
    },
    plugins: [
      react(),
      {
        name: "compound-demo-snapshot",
        resolveId(id) {
          if (id === demoModule) return resolvedDemoModule;
          if (id === demoPropertyModule) return resolvedDemoPropertyModule;
          return null;
        },
        load(id) {
          if (id === resolvedDemoModule) return `export default ${JSON.stringify(demo)};`;
          if (id === resolvedDemoPropertyModule) return `export default ${JSON.stringify(demoProperty)};`;
          return null;
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
