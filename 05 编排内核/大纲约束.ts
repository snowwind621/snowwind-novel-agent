// 只负责一件事：从大纲/细纲/章卡里取出「这一章必须发生什么、不许发生什么」，供多视角与核对用。

import fs from "node:fs"
import path from "node:path"
import { 路径 } from "../10 书库检索/书库布局"

export interface 本章纲要 {
  卷?: string
  卷区间?: string
  卷功能?: string
  卷代价?: string
  章名?: string
  纲要: string
  在场名单: string[]
  禁项: string[]
  爽点?: string
  来源: string[]
}

const 读 = (文件: string): string => {
  try {
    return fs.readFileSync(文件, "utf8")
  } catch {
    return ""
  }
}

/** 情节/ 下名字含关键词的 md（大纲/细纲/章卡都用它找文件）。 */
function 情节文件们(根: string, 关键词: string[]): string[] {
  const 目录 = path.join(根, 路径.情节)
  let 名们: string[] = []
  try {
    名们 = fs.readdirSync(目录).filter((名) => 名.endsWith(".md") && 关键词.some((键) => 名.includes(键)))
  } catch {
    return []
  }
  return 名们.sort()
}

/** 从分卷大纲主表里取本章所属的卷。 */
function 取卷(根: string, 章节号: number): { 卷?: string; 区间?: string; 功能?: string; 代价?: string; 来源?: string } {
  const 文件 = 情节文件们(根, ["分卷大纲", "大纲"])[0]
  if (!文件) return {}
  const 文本 = 读(path.join(根, 路径.情节, 文件))
  for (const 行 of 文本.split(/\r?\n/)) {
    if (!行.trim().startsWith("|")) continue
    const 格 = 行.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((项) => item(项))
    const 区间 = 格.find((项) => /^\d{1,3}\s*[-–~]\s*\d{1,3}$/.test(项))
    if (!区间) continue
    const [起, 止] = 区间.split(/[-–~]/).map((项) => Number(项.trim()))
    if (!(章节号 >= 起 && 章节号 <= 止)) continue
    const 卷名 = 格.find((项) => 项.endsWith("卷")) ?? ""
    return { 卷: 卷名, 区间, 功能: 格[4] ?? "", 代价: 格[5] ?? "", 来源: 文件 + " 主表「" + (卷名 || 区间) + "」" }
  }
  return {}
}

const item = (文本: string): string => 文本.replace(/\*\*/g, "").replace(/^\s+|\s+$/g, "")

/** 取细纲里本章那一段（## ch28 … 到下一个 ## 之前）。 */
function 取细纲(根: string, 章节号: number): { 章名?: string; 纲要: string; 禁项: string[]; 在场: string[]; 来源?: string } {
  const 文件们 = 情节文件们(根, ["细纲"])
  for (const 文件 of 文件们) {
    const 行们 = 读(path.join(根, 路径.情节, 文件)).split(/\r?\n/)
    const 起 = 行们.findIndex((行) => new RegExp("^#{1,3}\\s*ch0*" + 章节号 + "(?![0-9])", "i").test(行.trim()))
    if (起 < 0) continue
    const 章名 = (/^#{1,3}\s*ch0?\d+\s*([^｜|\n]+)/i.exec(行们[起].trim()) ?? [])[1]?.trim() ?? ""
    const 段: string[] = []
    const 禁项: string[] = []
    let 在场: string[] = []
    for (let 序 = 起 + 1; 序 < 行们.length; 序++) {
      const 行 = 行们[序]
      if (/^#{1,3}\s*ch0?\d+/i.test(行.trim())) break
      const 干 = 行.trim()
      if (!干) continue
      // 在场名单：本章的在场名单＝…：A、B、C
      const 名单 = /在场名单[＝=:：][^：:]*[：:](.+)$/.exec(干)
      if (名单) {
        在场 = 名单[1]
          .replace(/[。.].*$/, "")
          .split(/[、,，\s]+/)
          .map((项) => item(项))
          .filter((项) => 项.length >= 2 && 项.length <= 6)
        段.push(干)
        continue
      }
      if (干.startsWith("🔴") || /不许|不得|一律不许/.test(干)) 禁项.push(item(干).slice(0, 220))
      段.push(干)
    }
    if (段.length === 0) continue
    return { 章名, 纲要: 段.join("\n").slice(0, 4000), 禁项, 在场, 来源: 文件 + " 的 ch" + 章节号 + " 段" }
  }
  return { 纲要: "", 禁项: [], 在场: [] }
}

/** 章卡爽点表里本章那一行（没有就不给）。 */
function 取爽点(根: string, 章节号: number): { 爽点?: string; 来源?: string } {
  const 文件 = 情节文件们(根, ["章卡", "爽点"])[0]
  if (!文件) return {}
  const 文本 = 读(path.join(根, 路径.情节, 文件))
  for (const 行 of 文本.split(/\r?\n/)) {
    const 格 = 行.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((项) => item(项))
    if (格.length < 3 || !/^\d{1,3}$/.test(格[0])) continue
    if (Number(格[0]) !== 章节号) continue
    return { 爽点: "爽点类型：" + (格[2] || "—") + "；强度：" + (格[3] || "—") + "；章末钩子：" + (格[4] || "—"), 来源: 文件 }
  }
  return {}
}

/**
 * 本章纲要：卷（来自大纲主表）+ 纲要/禁项/在场（来自细纲本章段）+ 爽点（来自章卡）。
 * 找不到的部分留空，绝不编。
 */
export function 取本章纲要(根: string, 章节号: number): 本章纲要 {
  const 卷 = 取卷(根, 章节号)
  const 细 = 取细纲(根, 章节号)
  const 卡 = 取爽点(根, 章节号)
  const 来源 = [卷.来源, 细.来源, 卡.来源].filter(Boolean) as string[]
  const 纲要 = [
    卷.卷 ? "【所属】" + 卷.卷 + (卷.区间 ? "（ch" + 卷.区间 + "）" : "") + (卷.功能 ? "｜这一卷要：" + 卷.功能 : "") + (卷.代价 ? "｜代价：" + 卷.代价 : "") : "",
    细.纲要 ? "【本章细纲】\n" + 细.纲要 : "",
    卡.爽点 ? "【章卡】" + 卡.爽点 : "",
  ]
    .filter(Boolean)
    .join("\n\n")
  return {
    卷: 卷.卷,
    卷区间: 卷.区间,
    卷功能: 卷.功能,
    卷代价: 卷.代价,
    章名: 细.章名,
    纲要,
    在场名单: 细.在场,
    禁项: 细.禁项.slice(0, 12),
    爽点: 卡.爽点,
    来源,
  }
}
