import { build } from "esbuild"

const 共用 = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
}

await build({ ...共用, entryPoints: ["01 应用外壳/主进程.ts"], outfile: "dist/main.cjs" })
await build({ ...共用, entryPoints: ["01 应用外壳/预加载.ts"], outfile: "dist/preload.cjs" })
await build({ ...共用, entryPoints: ["01 应用外壳/浏览器预览.ts"], outfile: "dist/预览.cjs" })
await build({ ...共用, entryPoints: ["16 书库迁移/命令行导入.ts"], outfile: "dist/导入.cjs" })
console.log("[构建] 主进程与预加载已产出")
