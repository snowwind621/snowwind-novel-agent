// 只负责一件事：把整个书库按结构契约体检一遍，一次报全（表头、类型、章号、重复、断链、同一事实两处）。

import fs from "node:fs"
import path from "node:path"
import { 路径, 设定分类 } from "./书库布局"
import { 解析表格 } from "./台账解析"
import { 台账规范们, 设定卡规范, 旧字段映射, 已知旧字段, 找列, 值符合 } from "./书库结构"

export interface 校验问题 {
  级别: "错误" | "提示"
  类别: string
  文件: string
  位置?: string
  说明: string
}

export interface 校验统计 {
  错误: number
  提示: number
  文件数: number
  按类别: Record<string, { 错误: number; 提示: number }>
}

export interface 校验结果 {
  问题: 校验问题[]
  统计: 校验统计
  概览: { 设定卡: number; 章节: number; 最新章节: number; 台账册: number }
}

function 走文件(目录: string, 后缀 = ".md"): string[] {
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
      else if (项.name.endsWith(后缀)) 出.push(全)
    }
  }
  走(目录)
  return 出
}

const 读 = (文件: string): string => {
  try {
    return fs.readFileSync(文件, "utf8")
  } catch {
    return ""
  }
}

/** 只认开头那对三横线包住的 frontmatter；标量、引号、内联数组、块数组都认。 */
export function 解析frontmatter(正文: string): Record<string, string | string[]> | null {
  const 文 = String(正文 ?? "").replace(/^\uFEFF/, "")
  if (!文.startsWith("---")) return null
  const 行们 = 文.split(/\r?\n/)
  const 结 = 行们.findIndex((行, 序) => 序 > 0 && 行.trim() === "---")
  if (结 < 0) return null
  const 出: Record<string, string | string[]> = {}
  let 当前键 = ""
  for (const 行 of 行们.slice(1, 结)) {
    const 块项 = /^\s*-\s+(.*)$/.exec(行)
    if (块项 && 当前键) {
      const 旧 = 出[当前键]
      const 值 = 块项[1].trim().replace(/^["']|["']$/g, "")
      出[当前键] = Array.isArray(旧) ? [...旧, 值] : [值]
      continue
    }
    const 键值 = /^([A-Za-z\u4e00-\u9fa5_][^:]*?):\s*(.*)$/.exec(行)
    if (!键值) continue
    当前键 = 键值[1].trim()
    const 值 = 键值[2].trim()
    if (值 === "") {
      出[当前键] = []
      continue
    }
    if (值.startsWith("[") && 值.endsWith("]")) {
      出[当前键] = 值
        .slice(1, -1)
        .split(",")
        .map((项) => 项.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
      continue
    }
    出[当前键] = 值.replace(/^["']|["']$/g, "")
  }
  return 出
}

export function 校验书库(根: string): 校验结果 {
  const 问题: 校验问题[] = []
  const 记 = (级别: 校验问题["级别"], 类别: string, 文件: string, 说明: string) => {
    问题.push({ 级别, 类别, 文件, 说明 })
  }

  if (!fs.existsSync(path.join(根, 路径.清单))) {
    记("错误", "书库", 路径.清单, "找不到「" + 路径.清单 + "」，这不像一个雪风卷宗书库")
    return 收尾(问题, { 设定卡: 0, 章节: 0, 最新章节: 0, 台账册: 0 })
  }

  // ── 正文：章号集合与最新章节 ──────────────────────────────
  const 章号们 = new Set<number>()
  for (const 文件 of 走文件(path.join(根, 路径.正文))) {
    const 匹配 = /^第(\d{3,4})章/.exec(path.basename(文件))
    if (匹配) 章号们.add(Number(匹配[1]))
  }
  const 最新章节 = 章号们.size > 0 ? Math.max(...章号们) : 0

  // ── 设定卡：frontmatter 白名单 / 类型 / 旧字段 ─────────────
  const 设定文件们 = 设定分类.flatMap((类) => 走文件(path.join(根, 路径.设定, 类)))
  const 已知字段 = new Set([...设定卡规范.必填, ...设定卡规范.可选, ...Object.keys(旧字段映射), ...已知旧字段])
  const uid集 = new Set<string>()
  for (const 文件 of 设定文件们) {
    const 相对 = path.relative(根, 文件).split(path.sep).join("/")
    const 头 = 解析frontmatter(读(文件))
    if (!头) {
      记("错误", "设定卡缺 frontmatter", 相对, "文件开头没有三横线包住的 frontmatter，脚本读不到它的字段")
      continue
    }
    const 规范: Record<string, unknown> = {}
    for (const [键, 值] of Object.entries(头)) 规范[旧字段映射[键] ?? 键] = 值
    for (const 字段 of 设定卡规范.必填) {
      const 值 = 规范[字段]
      if (值 === undefined || (typeof 值 === "string" && 值.trim() === "")) 记("错误", "设定卡缺字段", 相对, "缺必填字段「" + 字段 + "」")
    }
    for (const [键, 类型] of Object.entries(设定卡规范.类型)) {
      const 值 = 规范[键]
      if (值 === undefined) continue
      if (类型 === "字符串列表" && !Array.isArray(值)) 记("错误", "设定卡字段类型", 相对, "「" + 键 + "」应该是列表（[a, b] 或 - a）")
      if (类型 === "文本" && Array.isArray(值)) 记("错误", "设定卡字段类型", 相对, "「" + 键 + "」应该是单个字符串")
      if (类型 === "章号" && typeof 值 === "string" && !值符合("章号", 值)) 记("错误", "设定卡字段类型", 相对, "「" + 键 + "」不像章号：" + 值)
    }
    for (const 键 of Object.keys(头)) {
      if (!已知字段.has(键)) 记("提示", "设定卡未知字段", 相对, "字段「" + 键 + "」不在白名单里，脚本不认识它")
      else if (旧字段映射[键]) 记("提示", "设定卡旧格式", 相对, "旧外部字段「" + 键 + "」，规范字段是「" + 旧字段映射[键] + "」")
    }
    const 收集 = (值: unknown) => {
      if (Array.isArray(值)) for (const 项 of 值) 收集(项)
      else if (typeof 值 === "string") {
        // 别名里可能是 "uid 22"（带引号）、"uid22"，也可能夹在别的字里，统一抓出来
        const 干净 = 值.replace(/["'«»]/g, "").trim()
        for (const 匹配 of 干净.matchAll(/uid\s*(\d+)/gi)) uid集.add(匹配[1])
      }
    }
    收集(规范.别名)
    收集(规范.标签)
  }

  // ── 台账七册：缺册 / 缺列 / 列类型 / 章号越界 / 编号重复 ──────
  const 台账超限: string[] = []
  let 台账册数 = 0
  for (const 规范 of 台账规范们) {
    const 文件 = path.join(根, 规范.相对路径)
    if (!fs.existsSync(文件)) {
      记("错误", "台账缺册", 规范.相对路径, "找不到这册台账")
      continue
    }
    台账册数++
    const 表们 = 解析表格(读(文件))
    if (表们.length === 0) {
      记("错误", "台账缺表", 规范.相对路径, "这册里一张 Markdown 表都没有")
      continue
    }
    for (const 列 of 规范.必需列) {
      const 表 = 表们.find((项) => 找列(项.表头, 列) >= 0)
      if (!表) {
        记("错误", "台账缺列", 规范.相对路径, "缺列「" + 列.名称 + "」（现有表头：" + 表们.map((项) => 项.表头.join("|")).join("；").slice(0, 120) + "）")
        continue
      }
      const 序 = 找列(表.表头, 列)
      const 坏: string[] = []
      for (const 行 of 表.行) {
        const 值 = (行[序] ?? "").trim()
        if (!值符合(列.类型, 值)) 坏.push(值)
      }
      if (坏.length > 0) 记("错误", "台账列类型", 规范.相对路径, "「" + 列.名称 + "」有 " + 坏.length + " 个值不是" + 列.类型 + "（例：" + 坏.slice(0, 3).join("、") + "）")
      if (列.类型 === "章号") {
        for (const 值 of 表.行.map((行) => (行[序] ?? "").trim())) {
          for (const 片 of 值.split(/[／/、,，;；\s]+/)) {
            const 数 = /^(?:ch\s*(\d+)|第?\s*(\d+)\s*章?)$/i.exec(片)
            if (!数) continue
            const 号 = Number(数[1] ?? 数[2])
            if (号 > 最新章节 || 号 < 1) 台账超限.push(规范.名称 + " " + 片)
          }
        }
      }
    }
    if (规范.编号列) {
      // 同一张表里重复才算错；跨表重复多半是「主表 + 兑现表」的设计，只提示
      const 表内 = new Map<string, number>()
      const 跨表 = new Map<string, Set<string>>()
      for (const 表 of 表们) {
        const 列序 = 找列(表.表头, { 名称: 规范.编号列, 类型: "文本" })
        if (列序 < 0) continue
        const 本表 = new Map<string, number>()
        for (const 行 of 表.行) {
          const 值 = (行[列序] ?? "").replace(/\*/g, "").trim()
          if (!值) continue
          本表.set(值, (本表.get(值) ?? 0) + 1)
          const 集 = 跨表.get(值) ?? new Set<string>()
          集.add(表.标题 || "未命名表")
          跨表.set(值, 集)
        }
        for (const [值, 次] of 本表) if (次 > 1) 表内.set(值, 次)
      }
      const 重 = [...表内.entries()].filter(([, 次]) => 次 > 1)
      if (重.length > 0) 记("错误", "编号重复", 规范.相对路径, 重复说明(重))
      const 跨 = [...跨表.entries()].filter(([, 集]) => 集.size > 1)
      if (跨.length > 0) 记("提示", "编号跨表重复", 规范.相对路径, 跨.slice(0, 6).map(([值, 集]) => 值 + " 出现在 " + [...集].join("、")).join("；"))
    }
  }
  for (const 越 of 台账超限.slice(0, 20)) 记("错误", "章号越界", "台账", 越 + "（全书只有 " + 最新章节 + " 章）")
  if (台账超限.length > 20) 记("错误", "章号越界", "台账", "还有 " + (台账超限.length - 20) + " 处章号越界未列出")

  // ── 引用断链：uid 与路径式引用 ─────────────────────────────
  const 引用文件们 = [...走文件(path.join(根, 路径.台账)), ...设定文件们, ...走文件(path.join(根, 路径.情节))]
  const 相对们 = 引用文件们.map((文件) => path.relative(根, 文件).split(path.sep).join("/"))
  const 断链uid = new Map<string, number>()
  const 断链路径 = new Map<string, { 文件: string; 次数: number }>()
  for (let 序 = 0; 序 < 引用文件们.length; 序++) {
    const 正文 = 读(引用文件们[序])
    for (const 匹配 of 正文.matchAll(/uid\s*(\d+)/gi)) {
      if (!uid集.has(匹配[1])) 断链uid.set(匹配[1], (断链uid.get(匹配[1]) ?? 0) + 1)
    }
    for (const 匹配 of 正文.matchAll(/(?:设定|台账|情节|计划|校验|留痕|考据|导航)\/[^\s|，。；、`）)】]+/g)) {
      const 引用 = 匹配[0].replace(/[)）】。，,]+$/, "").replace(/\.md$/, "")
      const 全 = path.join(根, 引用)
      const 存在 = fs.existsSync(全) || fs.existsSync(全 + ".md")
      if (!存在) {
        const 旧 = 断链路径.get(引用)
        断链路径.set(引用, { 文件: 旧?.文件 ?? 相对们[序], 次数: (旧?.次数 ?? 0) + 1 })
      }
    }
  }
  for (const [号, 次] of [...断链uid.entries()].slice(0, 10)) 记("错误", "引用断链", "设定/台账", "引用了 uid " + 号 + "，但没有任何设定卡认领它（共 " + 次 + " 处）")
  for (const [引用, 信] of [...断链路径.entries()].slice(0, 10)) 记("错误", "引用断链", 信.文件, "引用的路径不存在：" + 引用 + "（共 " + 信.次数 + " 处）")

  // ── 同一事实两处：长行在两个以上文件里一字不差 ──────────────
  const 行到文件 = new Map<string, Set<string>>()
  for (let 序 = 0; 序 < 引用文件们.length; 序++) {
    // 归档目录是刻意保留旧副本的，不算「同一事实存两处」
    if (/\/(历史|归档|备份)\//.test(相对们[序])) continue
    for (const 行 of 读(引用文件们[序]).split(/\r?\n/)) {
      const 干 = 行.trim()
      if (干.length < 40 || 干.startsWith("|") || 干.startsWith("---")) continue
      const 集 = 行到文件.get(干) ?? new Set<string>()
      集.add(相对们[序])
      行到文件.set(干, 集)
    }
  }
  const 对们 = new Map<string, number>()
  for (const [, 集] of 行到文件) {
    if (集.size < 2) continue
    const 列 = [...集].sort()
    for (let 甲 = 0; 甲 < 列.length; 甲++) {
      for (let 乙 = 甲 + 1; 乙 < 列.length; 乙++) {
        const 键 = 列[甲] + " ↔ " + 列[乙]
        对们.set(键, (对们.get(键) ?? 0) + 1)
      }
    }
  }
  for (const [对, 次] of [...对们.entries()].sort((甲, 乙) => 乙[1] - 甲[1]).slice(0, 8)) {
    记("错误", "同一事实两处", 对.split(" ↔ ")[0], 对 + " 有 " + 次 + " 行完全相同，同一份内容存了两处")
  }

  return 收尾(问题, { 设定卡: 设定文件们.length, 章节: 章号们.size, 最新章节, 台账册: 台账册数 })
}

function 重复说明(重: Array<[string, number]>): string {
  return "编号重复：" + 重.slice(0, 8).map(([号, 次]) => 号 + "×" + 次).join("、") + (重.length > 8 ? " 等 " + 重.length + " 组" : "")
}

function 收尾(问题: 校验问题[], 概览: 校验结果["概览"]): 校验结果 {
  const 按类别: Record<string, { 错误: number; 提示: number }> = {}
  let 错误 = 0
  let 提示 = 0
  for (const 项 of 问题) {
    const 槽 = 按类别[项.类别] ?? { 错误: 0, 提示: 0 }
    if (项.级别 === "错误") {
      错误++
      槽.错误++
    } else {
      提示++
      槽.提示++
    }
    按类别[项.类别] = 槽
  }
  return { 问题, 统计: { 错误, 提示, 文件数: 概览.设定卡, 按类别 }, 概览 }
}