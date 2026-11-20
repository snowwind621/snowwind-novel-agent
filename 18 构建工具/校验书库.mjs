// 只负责一件事：命令行给一本「雪风卷宗」做结构体检，人可读报告 + 非零退出码。
//
// 用法：node "18 构建工具/校验书库.mjs" <书库目录> [--json] [--修复建议]

import { build } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const 根目录 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const 参数 = process.argv.slice(2)
const 书库 = path.resolve(参数.find((项) => !项.startsWith("--")) ?? "")
const 要JSON = 参数.includes("--json")
const 要建议 = 参数.includes("--修复建议")

async function 装载() {
  const 入口 = 'export { 校验书库 } from "./10 书库检索/书库校验.ts"'
  const 产物 = await build({
    stdin: { contents: 入口, resolveDir: 根目录, sourcefile: "校验入口.ts", loader: "ts" },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["electron"],
    logLevel: "silent",
  })
  const 模块 = { exports: {} }
  const 求值 = new Function("exports", "require", "module", "__filename", "__dirname", 产物.outputFiles[0].text)
  求值(模块.exports, createRequire(path.join(根目录, "package.json")), 模块, path.join(根目录, "校验入口.cjs"), 根目录)
  return 模块.exports
}

async function 主() {
  if (!书库 || !fs.existsSync(path.join(书库, "书卷.yaml"))) {
    console.error("用法：node \"18 构建工具/校验书库.mjs\" <书库目录> [--json] [--修复建议]")
    console.error("（目录里必须有 书卷.yaml）")
    process.exit(2)
  }
  const { 校验书库 } = await 装载()
  const 结果 = 校验书库(书库)

  if (要JSON) {
    console.log(JSON.stringify(结果, null, 2))
    process.exit(结果.统计.错误 > 0 ? 1 : 0)
  }

  console.log("雪风卷宗 · 结构体检")
  console.log("书库：" + 书库)
  console.log(
    "概览：" +
      "设定卡 " + 结果.概览.设定卡 +
      " 张 · 章节 " + 结果.概览.章节 +
      " 章（最新 ch" + 结果.概览.最新章节 + "）· 台账 " + 结果.概览.台账册 + " 册",
  )
  console.log("")
  if (结果.问题.length === 0) {
    console.log("全部通过 ✅（没有发现问题）")
    process.exit(0)
  }
  const 按级别 = { 错误: 结果.问题.filter((项) => 项.级别 === "错误"), 提示: 结果.问题.filter((项) => 项.级别 === "提示") }
  for (const 级别 of ["错误", "提示"]) {
    const 组 = 按级别[级别]
    if (组.length === 0) continue
    console.log("【" + 级别 + "】" + 组.length + " 条")
    const 按类 = new Map()
    for (const 项 of 组) {
      const 列表 = 按类.get(项.类别) ?? []
      列表.push(项)
      按类.set(项.类别, 列表)
    }
    for (const [类别, 列表] of 按类) {
      console.log("  · " + 类别 + "（" + 列表.length + "）")
      for (const 项 of 列表.slice(0, 6)) console.log("      - " + 项.文件 + "：" + 项.说明)
      if (列表.length > 6) console.log("      … 还有 " + (列表.length - 6) + " 条")
    }
    console.log("")
  }
  if (要建议) {
    console.log("【修复建议】")
    for (const [类别, 计] of Object.entries(结果.统计.按类别)) {
      if (计.错误 === 0) continue
      const 建议 =
        类别 === "台账缺列" ? "照 schema 把缺的列补到表头（补齐后重跑本脚本）"
          : 类别 === "台账列类型" ? "把不合规的格子改成规范写法（章号写 ch27 或 27，数字列只留数字）"
            : 类别 === "编号重复" ? "同一编号只保留一行；旧口径写进 留痕/"
              : 类别 === "引用断链" ? "把悬空引用改指向真实文件，或补上对应卡片/条目"
                : 类别 === "同一事实两处" ? "认准一处正本，另一处改成指针（链接）或删掉"
                  : 类别 === "章号越界" ? "章号超过全书最新章，要么改章号，要么先写正文"
                    : 类别 === "设定卡缺字段" ? "补 frontmatter：名称 / 类型 / 状态（别名、标签、首次出场可选）"
                      : "按 15 文档规范/雪风卷宗格式.md 的 schema 补齐"
      console.log("  · " + 类别 + "：" + 建议)
    }
    console.log("（--修复建议 只给提示，不改任何文件）")
  }
  console.log("──────── 汇总 ────────")
  console.log("错误 " + 结果.统计.错误 + " 条，提示 " + 结果.统计.提示 + " 条。有问题，先修再提交。")
  process.exit(结果.统计.错误 > 0 ? 1 : 0)
}

主().catch((错误) => {
  console.error("体检脚本自己炸了：", (错误 && 错误.stack) || 错误)
  process.exit(2)
})
