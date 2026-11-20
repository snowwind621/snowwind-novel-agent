import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  root: "02 界面渲染",
  base: "./",
  build: { outDir: "../99 构建产物/renderer", emptyOutDir: true },
  plugins: [react()],
})
