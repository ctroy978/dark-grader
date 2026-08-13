import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Production is hosted at /gradeforge/. Local `vite` stays at `/`.
  base: process.env.VITE_BASE || (command === "build" ? "/gradeforge/" : "/"),
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
}));
