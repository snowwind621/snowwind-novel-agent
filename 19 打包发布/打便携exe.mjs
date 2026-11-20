// 只负责一件事：调 electron-builder 把「99 构建产物」打成 Windows 便携 exe，并报出产物路径与体积。
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const 根 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const 产物目录 = path.join(根, "99 构建产物", "发布")

function 读包(名) {
  const 文件 = path.join(根, "node_modules", 名, "package.json")
  if (!fs.existsSync(文件)) return null
  return JSON.parse(fs.readFileSync(文件, "utf8"))
}

const 构建器 = 读包("electron-builder")
if (!构建器) {
  console.error("❌ 没找到 electron-builder。先跑 npm install（它已写进 devDependencies）。")
  process.exit(1)
}
if (!fs.existsSync(path.join(根, "99 构建产物", "main.cjs"))) {
  console.error("❌ 99 构建产物/main.cjs 不存在。先跑 npm run build（npm run 打包 会自动做这一步）。")
  process.exit(1)
}

const 用的入口 = typeof 构建器.bin === "string" ? 构建器.bin : 构建器.bin["electron-builder"]
const 入口 = path.join(根, "node_modules", "electron-builder", 用的入口)

console.log("[打包] 正在产出 Windows 便携 exe，第一次会下载 NSIS 与签名工具，耐心等…")
// 缓存与临时目录都跟着 dist 走，不往系统目录里撒：清 dist 就是彻底清干净；
// 系统临时目录被限权/空间不够时，makensis 会报 "error creating mmap"，用自己的临时目录最省事。
const 结果 = spawnSync(process.execPath, [入口, "--win", "portable", "--config", path.join(根, "19 打包发布", "打包配置.yml")], {
  cwd: 根,
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_BUILDER_CACHE: path.join(根, "99 构建产物", "eb-cache"),
    TMP: path.join(根, "99 构建产物", "tmp"),
    TEMP: path.join(根, "99 构建产物", "tmp"),
  },
})
if (结果.status !== 0) {
  console.error("❌ electron-builder 失败，退出码 " + 结果.status)
  process.exit(结果.status ?? 1)
}

const exe们 = fs.existsSync(产物目录) ? fs.readdirSync(产物目录).filter((名) => 名.toLowerCase().endsWith(".exe")) : []
if (exe们.length === 0) {
  console.error("❌ 打包跑完了，但 " + 产物目录 + " 里没有 exe。")
  process.exit(1)
}

let 合计 = 0
for (const 名 of exe们) {
  const 全 = path.join(产物目录, 名)
  const 兆 = fs.statSync(全).size / 1048576
  合计 += 兆
  console.log("✅ " + 全 + "  " + 兆.toFixed(1) + " MB")
}
console.log("[打包] 合计 " + 合计.toFixed(1) + " MB。双击即可运行，不用安装；数据仍在 %APPDATA%\\snowwind-novel-agent。")
