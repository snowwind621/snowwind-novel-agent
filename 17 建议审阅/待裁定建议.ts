// 只负责一件事：把派活回答里的设定/台账修改意见抽成待裁定文件，并读回条目——绝不自动改设定。

import fs from "node:fs"
import path from "node:path"
import { 路径 } from "../10 书库检索/书库布局"

/** 待裁定建议统一放在书库的「设定/待裁定」下，一章一份；路径的正本在书库布局里。 */
export const 待裁定目录 = 路径.待裁定

/** 章号三位对齐，跟正文文件同一套习惯，方便人对齐看。 */
export function 建议文件名(章号: number): string {
  return "第" + String(章号).padStart(3, "0") + "章 建议.md"
}

export interface 建议条目 {
  提者: string
  角色: string
  内容: string
  依据: string
  状态: "待定"
}

export interface 待裁定章 {
  章号: number
  标题: string
  条目: 建议条目[]
}

const 小节词 = /(建议|意见|修改|调整)/
const 每条上限 = 12
const 正文上限 = 300

/** 把小节标题认出来：Markdown 井号标题、或独占一行的加粗标题。 */
function 标题文本(行: string): string | null {
  const 修剪 = 行.trim()
  const 井号 = /^#{1,6}\s*(.+)$/.exec(修剪)
  if (井号) return 取干净(井号[1])
  const 加粗 = /^\*\*(.+?)\*\*[:：]?$/.exec(修剪)
  if (加粗) return 取干净(加粗[1])
  return null
}

function 取干净(文本: string): string {
  return 文本.replace(/^[*#\s]+|[*\s]+$/g, "").trim()
}

/** 「依据」可能写成括号注，也可能单独一段，两种都拆开。 */
function 拆依据(原文: string): { 内容: string; 依据: string } {
  const 文 = 原文.replace(/\*\*/g, "").trim()
  const 括注 = /^(.*?)\s*[（(]\s*(?:依据|理由|出处)\s*[:：]?\s*([^）)]+)[）)]\s*$/.exec(文)
  if (括注) return { 内容: 收尾(括注[1]), 依据: 括注[2].trim() }
  const 尾注 = /^(.*?)\s*(?:依据|理由|出处)\s*[:：]\s*(.+)$/.exec(文)
  if (尾注) return { 内容: 收尾(尾注[1]), 依据: 尾注[2].trim() }
  return { 内容: 收尾(文), 依据: "" }
}

function 收尾(文本: string): string {
  return 文本.replace(/[，,；;、：:\s]+$/, "").trim().slice(0, 正文上限)
}

/**
 * 从一个负责人的回答里抽出修改意见。
 * 只认两种写法：「建议」小节下的列表项，以及行内写成「建议：……」的句子。
 * 认不出来就返回空——宁可少记，也不要凭空造建议。
 */
function 抽一个人的(产出: string, 提者: string, 角色: string): 建议条目[] {
  const 结果: 建议条目[] = []
  const 已见 = new Set<string>()
  let 在小节里 = false
  for (const 原行 of 产出.replace(/\r/g, "").split("\n")) {
    const 标 = 标题文本(原行)
    if (标 !== null) {
      在小节里 = 小节词.test(标)
      continue
    }
    const 行内 = /^[-*·]?\s*(?:\*\*)?建议(?:\*\*)?\s*[:：]\s*(.+)$/.exec(原行.trim())
    const 列表 = /^(?:[-*·]|\d+[.、)])\s*(.+)$/.exec(原行.trim())
    const 原文 = 行内 ? 行内[1] : 在小节里 && 列表 ? 列表[1] : ""
    if (!原文) continue
    const { 内容, 依据 } = 拆依据(原文)
    if (内容.length < 4 || 已见.has(内容)) continue
    已见.add(内容)
    结果.push({ 提者, 角色, 内容, 依据, 状态: "待定" })
    if (结果.length >= 每条上限) break
  }
  return 结果
}

/** 输入派活的「各自」，输出建议条目。失败的成员只留一行错误，不去抽。 */
export function 抽建议(
  各自: Array<{ 成员: string; 角色: string; 产出: string; 成功?: boolean }>,
): 建议条目[] {
  const 全部: 建议条目[] = []
  for (const 项 of 各自 ?? []) {
    if (项.成功 === false) continue
    全部.push(...抽一个人的(String(项.产出 ?? ""), 项.成员, 项.角色))
  }
  return 全部
}

/** 落一份待裁定文件；同一章重跑整份覆盖，旧建议不会赖着不走。 */
export function 写建议文件(根目录: string, 章号: number, 标题: string, 条目: 建议条目[]): string {
  const 相对 = 待裁定目录 + "/" + 建议文件名(章号)
  const 绝对 = path.join(根目录, 待裁定目录, 建议文件名(章号))
  fs.mkdirSync(path.dirname(绝对), { recursive: true })
  const 行: string[] = [
    "# 第 " + 章号 + " 章《" + (标题 || "未命名") + "》· 待裁定建议",
    "",
    "> 派活结束后自动抽取：只记录，不采纳——设定卡与台账一个字都没改。",
    "> 要不要改由作者裁定；同一章重跑会整份覆盖。",
    "",
    "共 " + 条目.length + " 条。",
    "",
  ]
  if (条目.length === 0) 行.push("这一轮派活里没有出现对设定或台账的修改意见。", "")
  for (let 序 = 0; 序 < 条目.length; 序++) {
    const 条 = 条目[序]
    行.push(
      "## 建议 " + (序 + 1) + " ｜ 提者：" + 条.提者 + " ｜ 角色：" + 条.角色,
      "- 建议：" + 条.内容,
      "- 依据：" + (条.依据 || "（未写明）"),
      "- 状态：待定",
      "",
    )
  }
  fs.writeFileSync(绝对, 行.join("\n"), "utf8")
  return 相对
}

/** 把一份建议文件读回结构化条目；条数以「## 建议」标题数为准。 */
function 解析(章号: number, 内容: string): 待裁定章 {
  const 条目: 建议条目[] = []
  let 标题 = ""
  let 当前: 建议条目 | null = null
  for (const 原行 of 内容.replace(/\r/g, "").split("\n")) {
    const 行 = 原行.trim()
    const 大标题 = /^#\s*第\s*\d+\s*章《(.*?)》/.exec(行)
    if (大标题) {
      标题 = 大标题[1]
      continue
    }
    const 头 = /^##\s*建议\s*\d+\s*｜\s*提者：(.*?)\s*｜\s*角色：(.*)$/.exec(行)
    if (头) {
      当前 = { 提者: 头[1], 角色: 头[2], 内容: "", 依据: "", 状态: "待定" }
      条目.push(当前)
      continue
    }
    if (!当前) continue
    const 建议 = /^-\s*建议：(.*)$/.exec(行)
    if (建议) {
      当前.内容 = 建议[1]
      continue
    }
    const 依据 = /^-\s*依据：(.*)$/.exec(行)
    if (依据) 当前.依据 = 依据[1] === "（未写明）" ? "" : 依据[1]
  }
  return { 章号, 标题, 条目 }
}

export function 读建议文件(根目录: string, 章号: number): 待裁定章 | null {
  const 绝对 = path.join(根目录, 待裁定目录, 建议文件名(章号))
  if (!fs.existsSync(绝对)) return null
  try {
    return 解析(章号, fs.readFileSync(绝对, "utf8"))
  } catch {
    return null
  }
}

/** 一次读回全书所有章的待裁定，按章号排好——界面拿这个数「该章」的条目数。 */
export function 读全部建议(根目录: string): 待裁定章[] {
  const 目录 = path.join(根目录, 待裁定目录)
  let 名们: string[] = []
  try {
    名们 = fs.readdirSync(目录)
  } catch {
    return []
  }
  const 结果: 待裁定章[] = []
  for (const 名 of 名们) {
    const 匹配 = /^第(\d{3,4})章 建议\.md$/.exec(名)
    if (!匹配) continue
    try {
      结果.push(解析(Number(匹配[1]), fs.readFileSync(path.join(目录, 名), "utf8")))
    } catch {
      /* 坏一份不拖累整张清单 */
    }
  }
  return 结果.sort((左, 右) => 左.章号 - 右.章号)
}
