// 只负责一件事：提交前扫一遍，确认仓库干净、没有密钥、没有大文件。
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const 根 = process.cwd()
const 只看暂存 = process.argv.includes("--暂存")
let 有问题 = false

function 报(名, 是好的, 说明) {
  console.log((是好的 ? "✅ " : "❌ ") + 名 + (说明 ? "：" + 说明 : ""))
  if (!是好的) 有问题 = true
}

function 跑(命令) {
  return execSync(命令, { cwd: 根, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

// 1. 工作区是否干净（预提交钩子里跳过这项，因为此刻本来就有待提交内容）
if (!只看暂存) {
  const 状态 = 跑("git status --porcelain")
  报("工作区干净", 状态 === "", 状态 ? 状态.split("\n").length + " 项待提交/未跟踪" : "")
}

// 2. 文件清单：钩子模式只看这一次要提交的内容
const 文件们 = (
  只看暂存
    ? 跑("git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR")
    : 跑("git -c core.quotepath=false ls-files")
)
  .split("\n")
  .filter(Boolean)

// 3. 密钥扫描
const 密钥式 = /sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/
const 泄漏 = []
for (const 文件 of 文件们) {
  if (/\.(png|jpg|jpeg|gif|webp|zip|docx|epub)$/i.test(文件)) continue
  let 内容 = ""
  try {
    内容 = fs.readFileSync(path.join(根, 文件), "utf8")
  } catch {
    continue
  }
  if (密钥式.test(内容)) 泄漏.push(文件)
}
报("没有密钥", 泄漏.length === 0, 泄漏.join("、"))

// 4. 大文件（> 1MB）
const 大文件 = 文件们
  .map((文件) => ({ 文件, 大小: fs.statSync(path.join(根, 文件)).size }))
  .filter((项) => 项.大小 > 1024 * 1024)
报("没有超过 1MB 的文件", 大文件.length === 0, 大文件.map((项) => 项.文件 + " " + Math.round(项.大小 / 1024) + "KB").join("、"))

// 5. 垃圾文件
const 垃圾 = 文件们.filter((文件) => /(^|\/)(er\.txt|ou\.txt|.*\.log|.*\.tmp|.*\.bak|Thumbs\.db|\.DS_Store)$/.test(文件))
报("没有日志与临时文件", 垃圾.length === 0, 垃圾.join("、"))

// 6. 依赖与产物没进库
const 混入 = 文件们.filter((文件) => /^(node_modules|dist)\//.test(文件))
报("依赖与构建产物已忽略", 混入.length === 0, 混入.slice(0, 3).join("、"))

console.log("")
console.log(有问题 ? "有需要处理的问题，先修再提交。" : "一切干净，可以提交。")
process.exit(有问题 ? 1 : 0)