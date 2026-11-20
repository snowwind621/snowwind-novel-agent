// 只负责一件事：把 Markdown 书库在内存里投影成结构化 JSON 给 agent 查——不落盘、不建第二份文件。

import fs from "node:fs"
import path from "node:path"
import type { 伏笔项 } from "../03 进程桥接/通道"
import { 路径, 台账册, 设定分类, 知情台账 } from "../10 书库检索/书库布局"
import { 解析表格, 解析承诺台账 } from "../10 书库检索/台账解析"
import { 台账规范们 } from "../10 书库检索/书库结构"
import { 解析frontmatter } from "../10 书库检索/书库校验"
import { 旧字段映射 } from "../10 书库检索/书库结构"
import { 合并伏笔 } from "../07 设定档案/伏笔模型"

const 读 = (文件: string): string => {
  try {
    return fs.readFileSync(文件, "utf8")
  } catch {
    return ""
  }
}

function 走文件(目录: string): string[] {
  const 出: string[] = []
  const 走 = (当前: string) => {
    let 项们: fs.Dirent[] = []
    try {
      项们 = fs.readdirSync(当前, { withFileTypes: true })
    } catch {
      return
    }
    for (const 项 of 项们) {
      const 全 = path.join(当前, 项.name)
      if (项.isDirectory()) 走(全)
      else if (项.name.endsWith(".md")) 出.push(全)
    }
  }
  走(目录)
  return 出
}

export interface 投影表 {
  标题: string
  列: string[]
  行: Array<Record<string, string>>
}

export interface 台账投影 {
  类型: string
  文件: string
  表: 投影表[]
  行数: number
}

/** 台账投影：类型可给「承诺台账」或「台账/承诺台账.md」；不给就投影全部七册。 */
export function 投影台账(根: string, 类型?: string): 台账投影[] {
  const 想要 = String(类型 ?? "").trim()
  const 选 = 台账规范们.filter(
    (规范) => !想要 || 规范.名称 === 想要 || 想要.includes(规范.名称) || 规范.相对路径 === 想要,
  )
  return 选.map((规范) => {
    const 表们 = 解析表格(读(path.join(根, 规范.相对路径)))
    const 表: 投影表[] = 表们.map((项) => ({
      标题: 项.标题,
      列: 项.表头,
      行: 项.行.map((格们) => {
        const 行: Record<string, string> = {}
        项.表头.forEach((列名, 序) => {
          行[列名 || "列" + (序 + 1)] = (格们[序] ?? "").trim()
        })
        return 行
      }),
    }))
    return { 类型: 规范.名称, 文件: 规范.相对路径, 表, 行数: 表.reduce((和, 项) => 和 + 项.行.length, 0) }
  })
}

export interface 设定投影 {
  名: string
  路径: string
  字段: Record<string, unknown>
  正文开头: string
  /** 名称命中还是正文命中（导入的老档案卡常把人物名写在正文里） */
  命中方式: "名称" | "正文"
}

/** 设定投影：按名称/别名/文件名模糊找（"三叶" 能命中 角色-05-三叶.md）。 */
export function 投影设定(根: string, 名: string): 设定投影 | null {
  const 键 = String(名 ?? "").trim()
  if (!键) return null
  const 文件们 = 设定分类.flatMap((类) => 走文件(path.join(根, 路径.设定, 类)))
  const 读卡 = (文件: string) => {
    const 正文 = 读(文件)
    const 头 = 解析frontmatter(正文) ?? {}
    const 规范: Record<string, unknown> = {}
    for (const [键2, 值] of Object.entries(头)) 规范[旧字段映射[键2] ?? 键2] = 值
    const 文件号 = path.basename(文件, ".md")
    return {
      正文,
      规范,
      文件号,
      名称: String(规范.名称 ?? 文件号),
      别名们: Array.isArray(规范.别名) ? 规范.别名.map(String) : [],
      路径: path.relative(根, 文件).split(path.sep).join("/"),
    }
  }
  const 卡们 = 文件们.map((文件) => ({ 文件, 卡: 读卡(文件) }))

  // ① 先按名字/别名/文件名认
  for (const { 卡 } of 卡们) {
    const 命中 = 卡.名称.includes(键) || 卡.文件号.includes(键) || 卡.别名们.some((项) => 项.includes(键))
    if (!命中) continue
    return { 名: 卡.名称, 路径: 卡.路径, 字段: 卡.规范, 正文开头: 卡.正文.replace(/^---[\s\S]*?---/, "").trim().slice(0, 800), 命中方式: "名称" }
  }

  // ② 名字认不出（导入的档案卡常把名字写在正文里）：退一步在正文里找，给命中处上下文
  for (const { 卡 } of 卡们) {
    const 位置 = 卡.正文.indexOf(键)
    if (位置 < 0) continue
    const 起 = Math.max(0, 位置 - 200)
    const 段 = 卡.正文.slice(起, 位置 + 400).replace(/^---[\s\S]*?---/, "").trim()
    return { 名: 卡.名称, 路径: 卡.路径, 字段: 卡.规范, 正文开头: "…" + 段 + "…", 命中方式: "正文" }
  }
  return null
}

/** 设定目录清单：只给名字与路径，方便 agent 先看有哪些人/地点。 */
export function 投影设定目录(根: string): Array<{ 名: string; 路径: string; 类型: string }> {
  return 设定分类.flatMap((类) =>
    走文件(path.join(根, 路径.设定, 类)).map((文件) => {
      const 头 = 解析frontmatter(读(文件)) ?? {}
      const 名称 = String((头 as any).名称 ?? (头 as any).title ?? path.basename(文件, ".md"))
      return {
        名: 名称,
        路径: path.relative(根, 文件).split(path.sep).join("/"),
        类型: String((头 as any).类型 ?? (头 as any).type ?? 类),
      }
    }),
  )
}

/** 伏笔投影：和看板同一套算法（承诺台账 + 参考间隔），所以条数必然一致。 */
export function 投影伏笔(根: string, 最新章节: number): 伏笔项[] {
  const 承诺 = 解析承诺台账(读(path.join(根, 台账册.承诺台账)))
  return 合并伏笔(承诺, 最新章节)
}

// ────────────────────────── 知情台账（谁知道哪条秘密） ──────────────────────────

export interface 知情条目 {
  人: string
  知道什么: string
  何时知道: number | null
  依据: string
}

export interface 知情秘密 {
  名称: string
  知情: 知情条目[]
  不知情: string[]
}

export interface 知情候选 {
  名称: string
  可能涉及: string[]
}

export interface 知情投影 {
  有台账: boolean
  秘密: 知情秘密[]
  候选: 知情候选[]
  说明: string
}

/** 从「ch1-27 全程」「ch3、ch5」里取最早露面的章；没写就是 null。 */
function 首次出场章(记录: string): number | null {
  let 最早: number | null = null
  for (const 片 of String(记录 ?? "").split(/[，,、；;\s]+/)) {
    const 范围 = /^(?:ch)?\s*(\d+)\s*[-–~～]\s*(?:ch)?\s*(\d+)$/i.exec(片)
    const 单 = /^(?:ch)?\s*(\d+)$/i.exec(片)
    const 号 = 范围 ? Number(范围[1]) : 单 ? Number(单[1]) : null
    if (号 !== null && (最早 === null || 号 < 最早)) 最早 = 号
  }
  return 最早
}

/** 出场追踪里所有出现过的人（带最早露面章）。 */
function 列人物(根: string): Array<{ 名: string; 首章: number | null }> {
  const 表们 = 解析表格(读(path.join(根, 台账册.出场追踪)))
  for (const 表 of 表们) {
    const 名列 = 表.表头.findIndex((头) => 头.includes("姓名") || 头.includes("名字"))
    const 记录列 = 表.表头.findIndex((头) => 头.includes("出场记录") || 头.includes("记录"))
    const 末列 = 表.表头.findIndex((头) => 头.includes("最后出场"))
    if (名列 < 0) continue
    return 表.行
      .map((行) => {
        const 名 = (行[名列] ?? "").replace(/\*/g, "").trim()
        const 记录 = 记录列 >= 0 ? (行[记录列] ?? "") : 末列 >= 0 ? (行[末列] ?? "") : ""
        return { 名, 首章: 首次出场章(记录) }
      })
      .filter((项) => 项.名)
  }
  return []
}

/** 从禁揭清单里尽力抽「秘密名 + 可能涉及的人物」，只作为「待补」候选，绝不写盘。 */
function 抽候选(根: string, 人名们: string[]): 知情候选[] {
  const 表们 = 解析表格(读(path.join(根, 路径.情节 + "/情节-03-禁揭清单.md")))
  const 出: 知情候选[] = []
  for (const 表 of 表们) {
    const 题列 = 表.表头.findIndex((头) => 头.includes("标题") || 头.includes("内容") || 头.includes("条目"))
    if (题列 < 0) continue
    for (const 行 of 表.行) {
      const 名 = (行[题列] ?? "").replace(/\*/g, "").replace(/^["「]|["」]$/g, "").trim()
      if (!名) continue
      const 整行 = 行.join(" ")
      const 涉及 = 人名们.filter((人) => 人 && 整行.includes(人))
      出.push({ 名称: 名.slice(0, 60), 可能涉及: 涉及.slice(0, 6) })
      if (出.length >= 30) return 出
    }
  }
  return 出
}

/**
 * 知情投影：谁知道哪条秘密、什么时候知道的；「不知情」= 出场追踪里的人减去知情名单。
 * 截至章给了就只算「何时知道 <= 截至章」的条目，只算「首章 <= 截至章」的人。
 * 台账不存在时优雅空态，并给出从禁揭清单抽来的「待补」候选。
 */
export function 投影知情(根: string, 截至章?: number): 知情投影 {
  const 人物们 = 列人物(根)
  const 人名们 = 人物们.map((项) => 项.名)
  const 候选 = 抽候选(根, 人名们)
  const 正文 = 读(path.join(根, 知情台账))

  const 分组 = new Map<string, 知情条目[]>()
  let 有表 = false
  for (const 表 of 解析表格(正文)) {
    const 秘列 = 表.表头.findIndex((头) => 头.includes("秘密") || 头.includes("事项"))
    const 人列 = 表.表头.findIndex((头) => 头.includes("人") || 头.includes("姓名"))
    if (秘列 < 0 || 人列 < 0) continue
    有表 = true
    const 知列 = 表.表头.findIndex((头) => 头.includes("知道什么") || 头.includes("知道"))
    const 时列 = 表.表头.findIndex((头) => 头.includes("何时知道") || 头.includes("何时"))
    const 依列 = 表.表头.findIndex((头) => 头.includes("依据") || 头.includes("出处"))
    for (const 行 of 表.行) {
      const 秘 = (行[秘列] ?? "").replace(/\*/g, "").trim()
      const 人 = (行[人列] ?? "").replace(/\*/g, "").trim()
      if (!秘 || !人) continue
      const 时文本 = 时列 >= 0 ? (行[时列] ?? "") : ""
      const 时 = /(\d+)/.exec(时文本)
      const 条目: 知情条目 = {
        人,
        知道什么: 知列 >= 0 ? (行[知列] ?? "").trim() : "",
        何时知道: 时 ? Number(时[1]) : null,
        依据: 依列 >= 0 ? (行[依列] ?? "").trim() : "",
      }
      const 旧 = 分组.get(秘) ?? []
      旧.push(条目)
      分组.set(秘, 旧)
    }
  }

  const 秘密: 知情秘密[] = []
  for (const [名称, 条目们] of 分组) {
    const 有效 = 截至章 === undefined ? 条目们 : 条目们.filter((项) => 项.何时知道 === null || 项.何时知道 <= 截至章)
    if (有效.length === 0 && 截至章 !== undefined) continue
    const 知情名单 = new Set(有效.map((项) => 项.人))
    const 不知情 = 人物们
      .filter((项) => !知情名单.has(项.名))
      .filter((项) => 截至章 === undefined || 项.首章 === null || 项.首章 <= 截至章)
      .map((项) => 项.名)
    秘密.push({ 名称, 知情: 有效, 不知情 })
  }

  const 说明 = 有表
    ? "共 " + 秘密.length + " 条秘密" + (截至章 !== undefined ? "（截至 ch" + 截至章 + "）" : "")
    : 正文.trim()
      ? "知情台账里还没读到「秘密 / 人 / 何时知道」这些列"
      : "还没有 台账/知情台账.md：下面是禁揭清单里可以补成知情台账的候选（只提示，不写盘）"
  return { 有台账: 有表, 秘密, 候选, 说明 }
}
