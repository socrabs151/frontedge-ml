import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const uiSrc = fileURLToPath(new URL("../../packages/ui/src", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // Relative assets: the built interface works under any prefix
    // FastAPI sets when mounting.
    base: "./",
    plugins: [react()],
    resolve: {
      alias: {
        // The spike app works against the library sources, not the built
        // package: otherwise the build fails when dist is not there yet.
        "@frontedge-ml/ui/styles.css": `${uiSrc}/styles/index.css`,
        "@frontedge-ml/ui": `${uiSrc}/index.ts`,
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
