import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // React и его экосистема — ответственность потребителя.
  external: ["react", "react-dom", "react/jsx-runtime"],
  treeshake: true,
});
