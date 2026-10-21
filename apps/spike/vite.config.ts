import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // Относительные ассеты: собранный интерфейс работает под любым префиксом,
    // который задаст FastAPI при монтировании.
    base: "./",
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
