import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // React and its ecosystem are the consumer's responsibility.
  external: ["react", "react-dom", "react/jsx-runtime"],
  treeshake: true,
});
