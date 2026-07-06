import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// 编译成单个独立 HTML 文件：所有 JS/CSS 内联，双击即用，无需服务器
export default defineConfig({
  plugins: [react(), viteSingleFile()],
});
