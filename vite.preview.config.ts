import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 浏览器预览 harness 专用配置（不影响 `vite build` 的 lib 产物）。
 * root 指到 preview/，插件源码经 ../src 直接以源码方式加载（HMR 生效）。
 */
export default defineConfig({
  root: path.resolve(__dirname, "preview"),
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5199 },
});
