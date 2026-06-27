import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// -----------------------------------------------------------------------------
// BELANGRIJK voor GitHub Pages: vul hieronder de naam van je GitHub-repository
// in (bijv. als je repo "tygoai" heet en je site straks op
// https://tygomassalt.github.io/tygoai/ komt, laat je dit op "/tygoai/" staan).
// Gebruik je een eigen domein of Firebase Hosting in plaats van GitHub Pages?
// Zet dit dan terug op "/".
// -----------------------------------------------------------------------------
const BASE_PATH = "/tygoai/";

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "TygoAI",
        short_name: "TygoAI",
        description: "Persoonlijke AI-assistent op basis van Nemotron",
        theme_color: "#1d1d1f",
        background_color: "#f5f5f7",
        display: "standalone",
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      }
    })
  ],
  server: {
    port: 5173
  }
});

