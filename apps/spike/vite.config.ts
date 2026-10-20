import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // Интерфейс отдаётся FastAPI под /frontedge — ассеты должны быть относительными.
    base: env.FE_BASE || "/",
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
