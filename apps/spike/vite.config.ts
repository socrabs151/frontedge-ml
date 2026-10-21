import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const uiSrc = fileURLToPath(new URL("../../packages/ui/src", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // Относительные ассеты: собранный интерфейс работает под любым префиксом,
    // который задаст FastAPI при монтировании.
    base: "./",
    plugins: [react()],
    resolve: {
      alias: {
        // Приложение-спайк работает с исходниками библиотеки, а не с собранным
        // пакетом: иначе сборка падает, если dist ещё не собран.
        "@frontedge/ui/styles.css": `${uiSrc}/styles/index.css`,
        "@frontedge/ui": `${uiSrc}/index.ts`,
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
