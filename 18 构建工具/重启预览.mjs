// 只负责一件事：把预览服务重启到最新构建——按端口结束旧进程，再拉起新进程，并确认能访问。
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const 根 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const 入口 = path.join(根, "99 构建产物", "预览.cjs")
if (!fs.existsSync(入口)) {
  console.error("没有 99 构建产物/预览.cjs，先跑 npm run build")
  process.exit(1)
}

function 找监听进程() {
  try {
    const 表 = execFileSync("netstat", ["-ano"], { encoding: "utf8" })
    for (const 行 of 表.split(/\r?\n/)) {
      if (!行.includes(":5178") || !行.includes("LISTENING")) continue
      const 段 = 行.trim().split(/\s+/)
      const 号 = 段[段.length - 1]
      if (/^\d+$/.test(号)) return Number(号)
    }
  } catch {
    /* netstat 不可用就当没占 */
  }
  return null
}

const 旧 = 找监听进程()
if (旧) {
  try {
    execFileSync("taskkill", ["/F", "/PID", String(旧)], { stdio: "ignore" })
    console.log("已结束旧预览进程 " + 旧)
  } catch {
    console.log("结束进程 " + 旧 + " 失败，可能权限不足；继续尝试启动")
  }
  await new Promise((r) => setTimeout(r, 900))
}

const 子 = spawn(process.execPath, [入口], { cwd: 根, detached: true, stdio: "ignore" })
子.unref()

for (let 次 = 0; 次 < 20; 次++) {
  await new Promise((r) => setTimeout(r, 400))
  try {
    const 响应 = await fetch("http://127.0.0.1:5178/")
    if (响应.ok) {
      console.log("预览已就绪：http://127.0.0.1:5178/（HTTP " + 响应.status + "）")
      // 不用 process.exit：管道下会截掉未刷出的 stdout
      break
    }
  } catch {
    /* 还没起来，继续等 */
  }
}
console.error("20 次探测都没起来，看看是不是端口被别的程序占了")
process.exit(1)
