// 只负责一件事：把书库里 AI 产出的「开写包」「待裁定」搬到 计划/ 下——只移动、留指针、绝不删除。
//
// 用法：node "18 构建工具/迁移-计划目录.mjs" <书库目录> [备份根目录]
//   ① 先把整本书备份到 99 构建产物/备份-重排前/<时间戳>（可用第二参数改）；
//   ② 旧位置有文件就搬到 计划/ 下（书库是 git 仓库时走 git mv，保住历史，否则退化成 rename）；
//   ③ 在旧目录写 指针.md，列出「原文件 → 现在的位置」；
//   ④ 全程不删任何文件；同名冲突只改名，不覆盖。

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const 书库 = path.resolve(process.argv[2] ?? "")
const 备份根 = path.resolve(process.argv[3] ?? path.join(process.cwd(), "99 构建产物", "备份-重排前"))

if (!书库 || !fs.existsSync(path.join(书库, "书卷.yaml"))) {
  console.error("用法：node \"18 构建工具/迁移-计划目录.mjs\" <书库目录> [备份根目录]")
  console.error("（目录里必须有 书卷.yaml）")
  process.exit(1)
}

const 计划 = {
  开写包: "计划/开写包",
  待裁定: "计划/待裁定",
  历史: "计划/历史",
}

const 迁移表 = [
  { 旧: "情节/开写包", 新: 计划.开写包, 说明: "派活生成的开写包（AI 产出，可重跑覆盖）" },
  { 旧: "设定/待裁定", 新: 计划.待裁定, 说明: "派活抽出的设定修改建议（只是建议，不进 canon）" },
]

const 是目录 = (目标) => {
  try {
    return fs.statSync(目标).isDirectory()
  } catch {
    return false
  }
}

const 数文件 = (目录) => {
  let 计 = 0
  const 走 = (当前) => {
    for (const 项 of fs.readdirSync(当前, { withFileTypes: true })) {
      const 全 = path.join(当前, 项.name)
      if (项.isDirectory()) 走(全)
      else 计++
    }
  }
  走(目录)
  return 计
}

const 是Git = fs.existsSync(path.join(书库, ".git"))
const 戳 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const 备份 = path.join(备份根, 戳)

console.log("书库：" + 书库)
console.log("是 git 仓库：" + (是Git ? "是（用 git mv）" : "否（退化成 rename，本来也没有历史可保）"))
const 迁移前文件数 = 数文件(书库)
fs.mkdirSync(备份根, { recursive: true })
fs.cpSync(书库, 备份, { recursive: true })
console.log("① 已备份到：" + 备份 + "（" + 数文件(备份) + " 个文件）")

let 移动数 = 0
let 指针数 = 0
const 明细 = []

for (const { 旧, 新, 说明 } of 迁移表) {
  const 旧绝对 = path.join(书库, 旧)
  fs.mkdirSync(path.join(书库, 新), { recursive: true })
  if (!是目录(旧绝对)) {
    console.log("· " + 旧 + "：不存在，跳过（新目录已就绪：" + 新 + "）")
    continue
  }
  const 文件们 = fs
    .readdirSync(旧绝对, { withFileTypes: true })
    .filter((项) => 项.isFile() && !["指针.md", "说明.md"].includes(项.name))
    .map((项) => 项.name)
  if (文件们.length === 0) {
    console.log("· " + 旧 + "：没有文件（只留空目录，指针对账不需要）")
    continue
  }

  const 行们 = []
  for (const 名 of 文件们) {
    const 旧相对 = 旧 + "/" + 名
    let 新名 = 名
    let 新相对 = 新 + "/" + 新名
    // 目标重名就改名，绝不覆盖（也绝不删）
    if (fs.existsSync(path.join(书库, 新相对))) {
      新名 = 名.replace(/(\.md)?$/, "（迁移冲突-" + 戳 + "）$1")
      新相对 = 新 + "/" + 新名
    }
    let 走git = false
    if (是Git) {
      try {
        execFileSync("git", ["mv", "--", 旧相对, 新相对], { cwd: 书库, stdio: "pipe" })
        走git = true
      } catch {
        走git = false
      }
    }
    if (!走git) fs.renameSync(path.join(书库, 旧相对), path.join(书库, 新相对))
    移动数++
    行们.push("| " + 名 + " | `" + 新相对 + "` | " + (走git ? "git mv" : "move") + " |")
    明细.push(旧相对 + " → " + 新相对)
  }

  // 旧目录留指针：不删，只告诉人「东西搬哪去了」
  const 指针文件 = path.join(旧绝对, "指针.md")
  const 已有 = fs.existsSync(指针文件) ? fs.readFileSync(指针文件, "utf8").trimEnd() + "\n\n" : ""
  const 段 = [
    "## " + 戳 + " 搬到 " + 新 + "/",
    "",
    "> " + 说明,
    "> 原目录不删任何内容，这里只留指针；要看内容请去 `" + 新 + "`。",
    "",
    "| 原文件 | 现在的位置 | 方式 |",
    "| --- | --- | --- |",
    ...行们,
    "",
  ].join("\n")
  if (!已有) {
    fs.writeFileSync(指针文件, "# 指针：本目录的 AI 产出已搬到「计划」\n\n" + 段, "utf8")
  } else {
    fs.writeFileSync(指针文件, 已有 + 段, "utf8")
  }
  指针数++
  console.log("· " + 旧 + " → " + 新 + "：搬了 " + 文件们.length + " 个文件，留了 1 个指针")
}

// 计划/ 三块永远都在；顺手放一份说明，免得后来人不知道这块归谁管
for (const 相对 of Object.values(计划)) fs.mkdirSync(path.join(书库, 相对), { recursive: true })
const 说明文件 = path.join(书库, "计划", "说明.md")
if (!fs.existsSync(说明文件)) {
  fs.writeFileSync(
    说明文件,
    [
      "# 计划（AI 产出）",
      "",
      "> 这里放的是智能体集群产出的东西：**可以随时重生成，不算 canon**。",
      "> 人写的结构（分卷大纲、细纲）留在 `情节/`；稳定设定留在 `设定/`。",
      "",
      "- `计划/开写包/`：每章一份开写包，派活后覆盖更新，文件名 `第NNN章 开写包.md`",
      "- `计划/待裁定/`：派活抽出的设定修改建议，等作者裁定，文件名 `第NNN章 建议.md`",
      "- `计划/历史/`：旧版本/被替换的产物留档",
      "",
    ].join("\n"),
    "utf8",
  )
}

const 迁移后文件数 = 数文件(书库)
console.log("")
console.log("移动了 " + 移动数 + " 个文件，留下 " + 指针数 + " 个指针。")
console.log("文件数：" + 迁移前文件数 + " → " + 迁移后文件数 + "（多出来的是指针与说明；没有删除任何文件）")
if (明细.length > 0) console.log("明细：\n  " + 明细.join("\n  "))
