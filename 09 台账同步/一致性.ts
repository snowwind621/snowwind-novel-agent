// 只负责一件事：跨台账交叉检查「AI 改了一处、另一处忘了改」，并把能安全补的补齐。
//
// 两类级别：可补齐 = 有唯一正确写法（补行/改一格），需裁定 = 得人拍板（只报不动）。
// 检查纯读；补齐必须带 确认: true 才写盘，未确认一律原样返回。

import fs from "node:fs"
import path from "node:path"
import { 路径, 台账册, 设定分类 } from "../10 书库检索/书库布局"
import { 解析表格 } from "../10 书库检索/台账解析"
import { 原子写文本 } from "../11 文件工作区/原子写"
import { 提交 } from "../11 文件工作区/Git提交"
import { 记事件 } from "../13 共享黑板/事件日志"

export interface 候选 {
  目标: string
  行?: string
}

export interface 一致性问题 {
  规则: string
  /** 提示 = 半成品里的正常情况（计划中的章），不计入错误数 */
  级别: "可补齐" | "需裁定" | "提示"
  册: string
  章号?: number
  说明: string
  候选?: 候选[]
  /** 稳定定位键：补齐时用它找行（规则 + 册 + 行主键） */
  键?: string
}

const 读 = (文件: string): string => {
  try {
    return fs.readFileSync(文件, "utf8")
  } catch {
    return ""
  }
}

const 拆行们 = (文本: string) => {
  const 换行 = 文本.includes("\r\n") ? "\r\n" : "\n"
  return { 行们: 文本.split(/\r?\n/), 换行 }
}

const 取格 = (行: string[] | undefined, 号: number): string => (行?.[号] ?? "").replace(/\*/g, "").trim()

const 章号们 = (值: string): number[] => {
  const 出: number[] = []
  for (const 匹配 of String(值 ?? "").matchAll(/(?:ch)?\s*(\d{1,4})/gi)) 出.push(Number(匹配[1]))
  return 出
}

/** 时间线：{ 章号, 事件, 日期 }[]（顺手把「日期」原文留着，查日期倒流用）。 */
function 读时间线(根: string): Array<{ 章号: number; 事件: string; 日期: string; 序: number }> {
  const 出: Array<{ 章号: number; 事件: string; 日期: string; 序: number }> = []
  for (const 表 of 解析表格(读(path.join(根, 台账册.时间线)))) {
    const 日列 = 表.表头.findIndex((头) => 头.includes("日期"))
    const 事列 = 表.表头.findIndex((头) => 头.includes("事件"))
    const 章列 = 表.表头.findIndex((头) => 头.includes("章"))
    if (日列 < 0 || 事列 < 0) continue
    表.行.forEach((行, 序) => {
      const 号 = 章列 >= 0 ? 章号们(取格(行, 章列))[0] : undefined
      if (号 === undefined) return
      出.push({ 章号: 号, 事件: 取格(行, 事列), 日期: 取格(行, 日列), 序 })
    })
  }
  return 出
}

/** 出场追踪：{ 姓名, 最后出场, 行序, 记录 }[]。 */
function 读出场(根: string): { 表: ReturnType<typeof 解析表格>[number] | null; 名列: number; 末列: number; 记录列: number; 行们: Array<{ 姓名: string; 最后出场: number; 行序: number }> } {
  const 表们 = 解析表格(读(path.join(根, 台账册.出场追踪)))
  for (const 表 of 表们) {
    const 名列 = 表.表头.findIndex((头) => 头.includes("姓名") || 头.includes("名字"))
    const 末列 = 表.表头.findIndex((头) => 头.includes("最后出场"))
    if (名列 < 0 || 末列 < 0) continue
    const 记录列 = 表.表头.findIndex((头) => 头.includes("出场记录") || 头.includes("记录"))
    return {
      表,
      名列,
      末列,
      记录列,
      行们: 表.行.map((行, 行序) => ({ 姓名: 取格(行, 名列), 最后出场: 章号们(取格(行, 末列))[0] ?? 0, 行序 })),
    }
  }
  return { 表: null, 名列: -1, 末列: -1, 记录列: -1, 行们: [] }
}

/** 人名词典：出场追踪 + 属性变更的「角色」 + 设定/人物 卡名 + 关系线两端。 */
function 读人名词典(根: string): string[] {
  const 出 = new Set<string>()
  for (const 项 of 读出场(根).行们) if (项.姓名) 出.add(项.姓名)
  for (const 表 of 解析表格(读(path.join(根, 台账册.属性变更)))) {
    const 角列 = 表.表头.findIndex((头) => 头.includes("角色") || 头.includes("人物"))
    if (角列 < 0) continue
    for (const 行 of 表.行) {
      const 名 = 取格(行, 角列)
      if (名 && 名.length <= 8 && !名.includes("全")) 出.add(名)
    }
  }
  for (const 表 of 解析表格(读(path.join(根, 台账册.关系线)))) {
    const 对列 = 表.表头.findIndex((头) => 头.includes("关系对") || 头.includes("人物对"))
    if (对列 < 0) continue
    for (const 行 of 表.行) {
      for (const 名 of 取格(行, 对列).split(/[↔<>\-—→、/／]/).map((项) => 项.trim()).filter(Boolean)) 出.add(名)
    }
  }
  const 人物目录 = path.join(根, 路径.设定, 设定分类[0])
  try {
    for (const 名 of fs.readdirSync(人物目录)) {
      if (!名.endsWith(".md") || 名 === "index.md") continue
      const 头 = 读(path.join(人物目录, 名))
      const 匹配 = /^(?:title|名称):\s*"?([^"\n]+)"?/m.exec(头)
      if (匹配) 出.add(匹配[1].trim())
    }
  } catch {
    /* 没有人物目录就不靠它 */
  }
  return [...出].filter((项) => 项.length >= 2)
}

/** 从 情节/ 下的大纲文件里取最大章号（＝计划章数下限）；找不到就 null。 */
function 读计划章数(根: string): number | null {
  const 目录 = path.join(根, 路径.情节)
  let 文件们: string[] = []
  try {
    文件们 = fs.readdirSync(目录).filter((名) => 名.endsWith(".md") && (名.includes("分卷大纲") || 名.includes("大纲")))
  } catch {
    return null
  }
  let 最大 = 0
  for (const 名 of 文件们) {
    for (const 号 of 章号们(读(path.join(目录, 名)))) if (号 >= 1 && 号 <= 999 && 号 > 最大) 最大 = 号
  }
  return 最大 > 0 ? 最大 : null
}

/** 设定/人物的卡片正文（查「有没有关于这个人的信息」）。 */
function 人物信源(根: string): string {
  const 目录 = path.join(根, 路径.设定, 设定分类[0])
  let 全 = ""
  try {
    for (const 名 of fs.readdirSync(目录)) {
      if (名.endsWith(".md")) 全 += 读(path.join(目录, 名)) + "\n"
    }
  } catch {
    /* 没有就没有 */
  }
  return 全
}

/**
 * 检查一致性：纯读，不写盘。
 * 六条规则见任务书；每条都说清「哪里对不上」，可补齐的带候选。
 */
export async function 检查一致性(根: string, 最新章节: number): Promise<一致性问题[]> {
  const 问题们: 一致性问题[] = []
  const 时间线 = 读时间线(根)
  const 出场 = 读出场(根)
  const 人名们 = 读人名词典(根)
  const 人物正文 = 人物信源(根)

  // ① 出场追踪漏人 / 漏更新（可补齐）
  // 人名匹配按全名优先：出场追踪写「丸井三叶」，时间线写「三叶」算同一个人（短名只在没有更长姓名认领时才算新人）
  const 认人 = (名: string) => {
    const 精确 = 出场.行们.find((项) => 项.姓名 === 名)
    if (精确) return 精确
    const 包含 = 出场.行们.find((项) => 项.姓名.includes(名) || 名.includes(项.姓名))
    return 包含 ?? null
  }
  const 最晚章 = new Map<string, number>()
  for (const 条 of 时间线) {
    for (const 名 of 人名们) {
      if (!条.事件.includes(名)) continue
      const 见过 = 认人(名)
      const 键 = 见过 ? 见过.姓名 : 名
      if ((最晚章.get(键) ?? 0) < 条.章号) 最晚章.set(键, 条.章号)
    }
  }
  for (const [键, 章] of 最晚章) {
    const 见过 = 出场.行们.find((项) => 项.姓名 === 键) ?? null
    if (!见过) {
      // 只有完全没在出场追踪露过面的人才新增一行
      if (!出场.表) continue
      问题们.push({
        规则: "出场追踪漏人",
        级别: "可补齐",
        册: 台账册.出场追踪,
        章号: 章,
        说明: "时间线 ch" + 章 + " 的事件提到「" + 键 + "」，但出场追踪里没有这个人",
        候选: [{ 目标: "新增「" + 键 + "」一行", 行: "| " + (出场.行们.length + 1) + " | " + 键 + " | ch" + 章 + " | ch" + 章 + "（一致性引擎补） |" }],
        键: "出场追踪新增:" + 键,
      })
    } else if (见过.最后出场 < 章) {
      问题们.push({
        规则: "出场追踪漏更新",
        级别: "可补齐",
        册: 台账册.出场追踪,
        章号: 章,
        说明: "时间线 ch" + 章 + " 提到「" + 键 + "」，但出场追踪写的最后出场是 ch" + (见过.最后出场 || "—"),
        候选: [{ 目标: "「" + 键 + "」最后出场改成 ch" + 章 }],
        键: "出场追踪更新:" + 键 + ":" + 章,
      })
    }
  }

  // ② 已兑伏笔无时间线事件（需裁定）
  const 时间线章 = new Set(时间线.map((条) => 条.章号))
  for (const 表 of 解析表格(读(path.join(根, 台账册.承诺台账)))) {
    const 编列 = 表.表头.findIndex((头) => 头.includes("编号"))
    const 名列 = 表.表头.findIndex((头) => 头.includes("承诺"))
    const 兑列 = 表.表头.findIndex((头) => 头.includes("兑"))
    if (编列 < 0 || 兑列 < 0) continue
    for (const 行 of 表.行) {
      const 兑 = 取格(行, 兑列)
      const 号们 = 章号们(兑).filter((号) => 号 >= 1 && 号 <= 最新章节)
      if (号们.length === 0) continue
      const 缺 = 号们.filter((号) => !时间线章.has(号))
      if (缺.length === 0) continue
      问题们.push({
        规则: "已兑伏笔无时间线事件",
        级别: "需裁定",
        册: 台账册.承诺台账,
        章号: 缺[0],
        说明: "「" + 取格(行, 名列) + "」（" + 取格(行, 编列) + "）标了在 ch" + 缺.join("/") + " 兑现，但时间线没有这几章的事件",
      })
    }
  }

  // ③ 属性值与队伍状态不符（需裁定）
  const 队伍表 = 解析表格(读(path.join(根, 台账册.队伍状态)))[0] ?? null
  const 队伍行们 = 队伍表 ? 队伍表.行.map((行) => ({ 项: 取格(行, 0), 值: 取格(行, 1) })) : []
  for (const 表 of 解析表格(读(path.join(根, 台账册.属性变更)))) {
    const 角列 = 表.表头.findIndex((头) => 头.includes("角色") || 头.includes("人物"))
    const 属列 = 表.表头.findIndex((头) => 头.includes("属性"))
    const 变列 = 表.表头.findIndex((头) => 头.includes("旧→新") || 头.includes("变化"))
    if (角列 < 0 || 属列 < 0 || 变列 < 0) continue
    for (const 行 of 表.行) {
      const 角 = 取格(行, 角列)
      const 属 = 取格(行, 属列)
      const 数 = /(\d+)\s*(?:→|->)\s*(\d+)/.exec(取格(行, 变列))
      if (!角 || !属 || !数) continue
      const 新值 = Number(数[2])
      for (const 队 of 队伍行们) {
        if (!队.项.includes(属) && !队.值.includes(属)) continue
        const 队数 = /(\d+)/.exec(队.值.replace(/[^0-9]/g, " ").replace(/\s+/g, " ")) ? /(\d+)/.exec(队.值) : null
        if (!队数) continue
        const 值 = Number(队数[1])
        if (值 !== 新值) {
          问题们.push({
            规则: "属性值与队伍状态不符",
            级别: "需裁定",
            册: 台账册.属性变更,
            说明: "「" + 角 + "」的「" + 属 + "」最新是 " + 新值 + "（属性变更），但队伍状态「" + 队.项 + "」写的是 " + 队.值,
          })
        }
      }
    }
  }

  // ④ 关系线提到的人物没有卡（需裁定）
  // 信源放宽到：出场追踪 + 属性变更角色 + 时间线事件 + 全部设定正文；只有「别处一次都没出现过」的人才报
  const 全设定 = (() => {
    let 全 = 人物正文
    for (const 类 of 设定分类) {
      const 目录 = path.join(根, 路径.设定, 类)
      try {
        for (const 名 of fs.readdirSync(目录)) if (名.endsWith(".md")) 全 += 读(path.join(目录, 名)) + "\n"
      } catch {
        /* 没有这类设定就算了 */
      }
    }
    return 全
  })()
  const 别处出现过 = (名: string) =>
    全设定.includes(名) ||
    出场.行们.some((项) => 项.姓名.includes(名) || 名.includes(项.姓名)) ||
    时间线.some((条) => 条.事件.includes(名))
  const 是像人名 = (名: string) => 名.length >= 2 && 名.length <= 10 && !/^[这那某等们家些]/.test(名) && !/\d/.test(名)
  // NPC 启发式：宁可少报。泛称词命中 / 只在关系线出现过一次且正文与时间线都没提过 → 当 NPC，不建卡
  const 泛称词 = /(员|工|兵|众|群|们|家|某|人|者|官|警|医|孩子|小孩|女人|村民|士兵|职员|干事|临时工|登记员|校长|隔壁|夫妻|夫妇)/
  const 正文全文 = (() => {
    let 全 = ""
    const 走正文 = (目录: string) => {
      let 项们: fs.Dirent[] = []
      try {
        项们 = fs.readdirSync(目录, { withFileTypes: true })
      } catch {
        return
      }
      for (const 项 of 项们) {
        const 全路径 = path.join(目录, 项.name)
        if (项.isDirectory()) 走正文(全路径)
        else if (项.name.endsWith(".md")) 全 += 读(全路径) + "\n"
      }
    }
    走正文(path.join(根, 路径.正文))
    return 全
  })()
  const 时间线全文 = 时间线.map((条) => 条.事件).join("\n")
  const 关系线计数 = new Map<string, number>()
  for (const 表 of 解析表格(读(path.join(根, 台账册.关系线)))) {
    const 对列 = 表.表头.findIndex((头) => 头.includes("关系对") || 头.includes("人物对"))
    if (对列 < 0) continue
    for (const 行 of 表.行) {
      for (const 名 of 取格(行, 对列).split(/[↔<>\-—→、/／]/).map((项) => 项.trim()).filter(Boolean)) {
        关系线计数.set(名, (关系线计数.get(名) ?? 0) + 1)
      }
    }
  }
  const 是NPC = (名: string) => {
    if (泛称词.test(名)) return true
    const 次数 = 关系线计数.get(名) ?? 0
    return 次数 <= 1 && !正文全文.includes(名) && !时间线全文.includes(名)
  }
  const 已报 = new Set<string>()
  for (const 表 of 解析表格(读(path.join(根, 台账册.关系线)))) {
    const 对列 = 表.表头.findIndex((头) => 头.includes("关系对") || 头.includes("人物对"))
    if (对列 < 0) continue
    for (const 行 of 表.行) {
      for (const 名 of 取格(行, 对列).split(/[↔<>\-—→、/／]/).map((项) => 项.trim()).filter(Boolean)) {
        if (已报.has(名) || !是像人名(名) || 别处出现过(名) || 是NPC(名)) continue
        已报.add(名)
        问题们.push({
          规则: "关系线人物无卡",
          级别: "需裁定",
          册: 台账册.关系线,
          说明: "关系线里出现了「" + 名 + "」，但设定/出场追踪/时间线里都没有关于他的任何信息",
          候选: [{ 目标: "给「" + 名 + "」建一张人物卡" }],
        })
      }
    }
  }

  // ⑤ 伏笔入账缺口（可补齐）：承诺台账的埋章在正文里没有对应章
  const 正文章 = new Set<number>()
  const 正文目录 = path.join(根, 路径.正文)
  const 走 = (目录: string) => {
    let 项们: fs.Dirent[] = []
    try {
      项们 = fs.readdirSync(目录, { withFileTypes: true })
    } catch {
      return
    }
    for (const 项 of 项们) {
      const 全 = path.join(目录, 项.name)
      if (项.isDirectory()) 走(全)
      else {
        const 匹配 = /^第(\d{3,4})章/.exec(项.name)
        if (匹配) 正文章.add(Number(匹配[1]))
      }
    }
  }
  走(正文目录)
  for (const 表 of 解析表格(读(path.join(根, 台账册.承诺台账)))) {
    const 编列 = 表.表头.findIndex((头) => 头.includes("编号"))
    const 名列 = 表.表头.findIndex((头) => 头.includes("承诺"))
    const 埋列 = 表.表头.findIndex((头) => 头.includes("埋"))
    if (编列 < 0 || 埋列 < 0) continue
    for (const 行 of 表.行) {
      const 埋 = 章号们(取格(行, 埋列))[0]
      if (!埋 || 正文章.has(埋)) continue
      问题们.push({
        规则: "伏笔埋章缺正文",
        级别: "可补齐",
        册: 台账册.承诺台账,
        章号: 埋,
        说明: "「" + 取格(行, 名列) + "」（" + 取格(行, 编列) + "）的埋章是 ch" + 埋 + "，但正文里没有第 " + 埋 + " 章",
        候选: [{ 目标: "把「" + 取格(行, 编列) + "」的埋章改到最近的已有章" }],
        键: "承诺埋章:" + 取格(行, 编列),
      })
    }
  }

  // ⑥ 章号越界 / 时间线日期倒流（需裁定）
  // 半成品里「写着还没写的章」是计划，不是错误：阈值取 max(最新章节, 大纲最大章号) + 30，找不到大纲回落 最新章节 + 30
  const 计划章数 = 读计划章数(根)
  const 计划上限 = Math.max(最新章节, 计划章数 ?? 0)
  const 提示上限 = 计划上限 + 30
  const 册们 = [台账册.时间线, 台账册.出场追踪, 台账册.属性变更, 台账册.关系线, 台账册.承诺台账]
  for (const 册 of 册们) {
    for (const 表 of 解析表格(读(path.join(根, 册)))) {
      const 章列们 = 表.表头.map((头, 序) => (头.includes("章") || 头.includes("埋") ? 序 : -1)).filter((序) => 序 >= 0)
      for (const 行 of 表.行) {
        for (const 列 of 章列们) {
          for (const 号 of 章号们(取格(行, 列))) {
            // 四位以上的数字多半是年份（2026）而不是章号，直接不当章号看
            if (号 > 999) continue
            if (号 < 1) {
              问题们.push({ 规则: "章号越界", 级别: "需裁定", 册, 章号: 号, 说明: "「" + 表.表头[列] + "」里写着 ch" + 号 + "，章号不能小于 1" })
              continue
            }
            if (号 <= 计划上限) continue
            // 计划上限之内正常；上限之后 30 章算「计划中的章」；再远才当笔误
            if (号 <= 提示上限) {
              问题们.push({
                规则: "章号越界",
                级别: "提示",
                册,
                章号: 号,
                说明:
                  "「" + 表.表头[列] + "」写着 ch" + 号 + "（计划中的章，正文还没写到；" +
                  (计划章数 ? "大纲计划到 ch" + 计划章数 : "全书已到 ch" + 最新章节) +
                  "）",
              })
            } else {
              问题们.push({
                规则: "章号越界",
                级别: "需裁定",
                册,
                章号: 号,
                说明:
                  "「" + 表.表头[列] + "」里写着 ch" + 号 + "，疑似笔误：全书只有 " + 最新章节 + " 章" +
                  (计划章数 ? "、大纲计划到 ch" + 计划章数 : ""),
              })
            }
          }
        }
      }
    }
  }
  const 日期序 = 时间线.filter((条) => /\d+月\d+日/.test(条.日期)).map((条) => ({ 章: 条.章号, 日: Number((/^(\d+)月/.exec(条.日期) ?? [])[1] ?? 0) * 31 + Number((/月(\d+)日/.exec(条.日期) ?? [])[1] ?? 0) }))
  for (let 序 = 1; 序 < 日期序.length; 序++) {
    const 前 = 日期序[序 - 1]
    const 后 = 日期序[序]
    if (后.章 >= 前.章 && 后.日 < 前.日) {
      问题们.push({
        规则: "时间线日期倒流",
        级别: "需裁定",
        册: 台账册.时间线,
        章号: 后.章,
        说明: "ch" + 前.章 + " 之后的 ch" + 后.章 + " 日期反而更早（" + 前.日 + " → " + 后.日 + "，按 月*31+日 折算）",
      })
    }
  }

  // 忽略名单：设定/一致性忽略.md，一行一条；# 开头是注释。写人名只压规则④，写规则名整条规则关掉
  const 忽略文件 = path.join(根, 路径.设定, "一致性忽略.md")
  const 忽略 = new Set(
    读(忽略文件)
      .split(/\r?\n/)
      .map((行) => 行.trim())
      .filter((行) => 行 && !行.startsWith("#")),
  )
  const 过滤后 = 问题们.filter((项) => {
    if (忽略.has(项.规则)) return false
    if (项.规则 === "关系线人物无卡") {
      const 名 = /「([^」]+)」/.exec(项.说明)?.[1] ?? ""
      if (名 && 忽略.has(名)) return false
    }
    return true
  })
  return 过滤后
}

export async function 补齐(
  根: string,
  问题们: 一致性问题[],
  数据目录: string,
  确认?: boolean,
): Promise<{ 成功: boolean; 改动: string[]; 说明: string; 问题们: 一致性问题[] }> {
  const 待办 = 问题们.filter((项) => 项.级别 === "可补齐")
  if (!确认) {
    return { 成功: false, 改动: [], 说明: "需要确认：补齐会改台账文件，请带 确认: true 再来（本次未改任何文件）", 问题们: 待办 }
  }
  if (待办.length === 0) return { 成功: true, 改动: [], 说明: "没有可补齐的问题", 问题们: [] }

  const 改动: string[] = []
  const 动过的文件 = new Set<string>()

  // 出场追踪：新增行 / 改最后出场
  const 出场文件 = path.join(根, 台账册.出场追踪)
  const 出场读 = 读出场(根)
  if (出场读.表) {
    const { 行们, 换行 } = 拆行们(读(出场文件))
    // 找到该表的表头行与最后一行
    let 表头行 = -1
    for (let 序 = 0; 序 < 行们.length; 序++) {
      if (行们[序].trim().startsWith("|") && 行们[序].includes("姓名") && 行们[序].includes("最后出场")) {
        表头行 = 序
        break
      }
    }
    if (表头行 >= 0) {
      let 末行 = 表头行 + 1
      while (末行 + 1 < 行们.length && 行们[末行 + 1].trim().startsWith("|")) 末行++
      const 新增: string[] = []
      for (const 问题 of 待办) {
        if (问题.册 !== 台账册.出场追踪 || !问题.键) continue
        if (问题.键.startsWith("出场追踪新增:")) {
          const 名 = 问题.键.slice("出场追踪新增:".length)
          if (行们.some((行) => 行.includes("| " + 名 + " |") || 行.includes("|" + 名 + "|"))) continue
          新增.push("| " + (出场读.行们.length + 新增.length) + " | " + 名 + " | ch" + (问题.章号 ?? "") + " | ch" + (问题.章号 ?? "") + "（一致性引擎补） |")
          改动.push("出场追踪 + 新增「" + 名 + "」（ch" + 问题.章号 + "）")
        } else if (问题.键.startsWith("出场追踪更新:")) {
          const [, 名, 章] = 问题.键.split(":")
          let 命中 = false
          for (let 序 = 表头行 + 2; 序 <= 末行; 序++) {
            const 格 = 行们[序].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((项) => 项.trim())
            if (格[出场读.名列] !== 名) continue
            格[出场读.末列] = "ch" + 章
            行们[序] = "| " + 格.join(" | ") + " |"
            命中 = true
            改动.push("出场追踪「" + 名 + "」最后出场 → ch" + 章)
          }
          if (!命中) continue
        }
      }
      if (新增.length > 0) 行们.splice(末行 + 1, 0, ...新增)
      if (改动.length > 0) {
        await 原子写文本(出场文件, 行们.join(换行))
        动过的文件.add(台账册.出场追踪)
      }
    }
  }

  if (动过的文件.size > 0) {
    const 提交结果 = await 提交(根, "一致性补齐：" + 改动.join("；").slice(0, 60), [...动过的文件])
    记事件(数据目录, 根, {
      时间: new Date().toISOString(),
      类型: "一致性补齐",
      发起者: "作者",
      摘要: 改动.join("；") + "；" + 提交结果.说明,
    })
    return { 成功: true, 改动, 说明: "已补齐 " + 改动.length + " 处；" + 提交结果.说明, 问题们: 待办 }
  }
  return { 成功: false, 改动: [], 说明: "可补齐的问题没能安全落地（可能都被人工改过了）；请重跑一致性检查", 问题们: 待办 }
}