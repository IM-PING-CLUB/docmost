import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

const envPath = path.resolve(process.cwd(), "..", "..");

export default defineConfig(({ mode }) => {
  const {
    APP_URL,
    FILE_UPLOAD_SIZE_LIMIT,
    FILE_IMPORT_SIZE_LIMIT,
    DRAWIO_URL,
    CLOUD,
    SUBDOMAIN_HOST,
    COLLAB_URL,
    BILLING_TRIAL_DAYS,
    POSTHOG_HOST,
    POSTHOG_KEY,
    OEM,
    OEM_HIDE_API_KEYS,
    OEM_HIDE_SECURITY_SSO,
    OEM_HIDE_API_MANAGEMENT,
    OEM_HIDE_AUDIT_LOG,
    OEM_HIDE_AI_SETTINGS,
    OEM_HIDE_VERSION_UPDATE,
    OEM_HIDE_LICENSE,
  } = loadEnv(mode, envPath, "");

  return {
    define: {
      "process.env": {
        APP_URL,
        FILE_UPLOAD_SIZE_LIMIT,
        FILE_IMPORT_SIZE_LIMIT,
        DRAWIO_URL,
        CLOUD,
        SUBDOMAIN_HOST,
        COLLAB_URL,
        BILLING_TRIAL_DAYS,
        POSTHOG_HOST,
        POSTHOG_KEY,
        OEM,
        OEM_HIDE_API_KEYS,
        OEM_HIDE_SECURITY_SSO,
        OEM_HIDE_API_MANAGEMENT,
        OEM_HIDE_AUDIT_LOG,
        OEM_HIDE_AI_SETTINGS,
        OEM_HIDE_VERSION_UPDATE,
        OEM_HIDE_LICENSE,
      },
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: "vendor-mantine", test: /@mantine/ },
              { name: "vendor-mermaid", test: /mermaid|cytoscape|elkjs/ },
              { name: "vendor-excalidraw", test: /excalidraw/ },
              { name: "vendor-katex", test: /katex/ },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      proxy: {
        "/api": {
          target: APP_URL,
          changeOrigin: false,
        },
        "/socket.io": {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
        "/collab": {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
  };
});
