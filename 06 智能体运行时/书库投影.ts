// 只负责一件事：把 Markdown 书库在内存里投影成结构化 JSON 给 agent 查——不落盘、不建第二份文件。

import fs from "node:fs"
import path from "node:path"
import type { 伏笔项 } from "../03 进程桥接/通道"
import { 路径, 台账册, 设定分类 } from "../10 书库检索/书库布局"
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