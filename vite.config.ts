import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: { port: 5173 },
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local') },
});
