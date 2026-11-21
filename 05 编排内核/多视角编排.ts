// 只负责一件事：多视角最小闭环——在场角色各写第一人称 → 总控收敛 → 执笔成文 → 大纲核对（不符不落盘）。

import fs from "node:fs"
import path from "node:path"
import type { 技能项 } from "../03 进程桥接/通道"
import type { 集群成员 } from "../06 智能体运行时/成员目录"
import { 路径, 知情台账 } from "../10 书库检索/书库布局"
import { 解析表格 } from "../10 书库检索/台账解析"
import { 投影设定 } from "../06 智能体运行时/书库投影"
import { 取本章纲要 } from "./大纲约束"
import type { 本章纲要 } from "./大纲约束"
import { 流式对话 } from "../04 模型接入/网关客户端"
import type { 调用策略 } from "../04 模型接入/网关客户端"

export interface 多视角参数 {
  根目录: string
  数据目录: string
  章节号: number
  成员们: 集群成员[]
  阵容上限: number
  讨论人数: number
  基址: string
  密钥: string
  模型: { 总编: string; 执笔: string; 审校: string; 助手: string }
  /** 核对专用非推理模型；不给就用 审校 */
  核对模型?: string
  /** 临时覆盖执笔模型（测试 / 兜底用）：不给就用 模型.执笔 */
  执笔模型?: string
  策略: 调用策略
  单卡注入字数: number
  技能: 技能项[]
  推: (进度: { 阶段: "纲要" | "在场" | "发言" | "收敛" | "成文" | "核对" | "完成" | "失败"; 谁?: string; 摘要?: string; 文本?: string }) => void
}

export interface 多视角结果 {
  成功: boolean
  章节号: number
  纲要: 本章纲要
  在场: string[]
  各视角: Array<{ 成员: string; 发言: string }>
  收敛: string
  正文: string
  大纲核对: 核对结论
  信息闸: { 下发: string[]; 卡住: string[] }
  说明: string
}

const 读 = (文件: string): string => {
  try {
    return fs.readFileSync(文件, "utf8")
  } catch {
    return ""
  }
}

/** 知情台账：谁能知道什么、第几章知道。 */
function 读知情(根: string): Array<{ 秘密: string; 人: string; 知道什么: string; 何时: number | null }> {
  const 出: Array<{ 秘密: string; 人: string; 知道什么: string; 何时: number | null }> = []
  for (const 表 of 解析表格(读(path.join(根, 知情台账)))) {
    const 秘列 = 表.表头.findIndex((头) => 头.includes("秘密") || 头.includes("事项"))
    const 人列 = 表.表头.findIndex((头) => 头.includes("人") || 头.includes("姓名"))
    if (秘列 < 0 || 人列 < 0) continue
    const 知列 = 表.表头.findIndex((头) => 头.includes("知道什么"))
    const 时列 = 表.表头.findIndex((头) => 头.includes("何时"))
    for (const 行 of 表.行) {
      const 秘 = (行[秘列] ?? "").replace(/\*/g, "").trim()
      const 人 = (行[人列] ?? "").replace(/\*/g, "").trim()
      if (!秘 || !人) continue
      const 号 = /(\d+)/.exec(时列 >= 0 ? 行[时列] ?? "" : "")
      出.push({ 秘密: 秘, 人, 知道什么: 知列 >= 0 ? (行[知列] ?? "").trim() : "", 何时: 号 ? Number(号[1]) : null })
    }
  }
  return 出
}

/** 从一段文本里抓出 JSON 对象（模型常带解释或代码块）。 */
function 取JSON(文本: string): any {
  const 净 = String(文本 ?? "").replace(/```(?:json)?/gi, "")
  const 末 = 净.lastIndexOf("}")
  for (let 起 = 净.indexOf("{"); 起 >= 0 && 起 < 末; 起 = 净.indexOf("{", 起 + 1)) {
    try {
      const 对象 = JSON.parse(净.slice(起, 末 + 1))
      if (对象 && typeof 对象 === "object") return 对象
    } catch {
      /* 继续往后找 */
    }
  }
  return null
}

/** 角色卡：设定/人物 里能查到的就给，查不到就说「没有档案」。 */
function 角色卡(根: string, 名: string): string {
  const 卡 = 投影设定(根, 名)
  if (!卡) return "（设定库里没有「" + 名 + "」的档案；只按细纲和你的记忆来，不要编新设定）"
  const 字段 = Object.entries(卡.字段 ?? {})
    .map(([键, 值]) => 键 + "：" + (Array.isArray(值) ? 值.join("、") : String(值)))
    .join("｜")
  return "【" + 卡.名 + "】" + 字段 + "\n" + String(卡.正文开头 ?? "").slice(0, 600)
}

const 圈码 = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"

/** 把细纲里的「①…⑰」拆成逐拍清单：拍号 + 这一拍要求。 */
export function 拆拍(纲要: 本章纲要): Array<{ 拍号: number; 要求: string }> {
  const 出: Array<{ 拍号: number; 要求: string }> = []
  for (const 行 of String(纲要.纲要 ?? "").split(/\r?\n/)) {
    const 干 = 行.trim()
    const 序 = 圈码.indexOf(干.slice(0, 1))
    if (序 < 0) continue
    const 要求 = 干.slice(1).replace(/^[、.．:：\s]+/, "").trim()
    if (要求.length < 4) continue
    出.push({ 拍号: 序 + 1, 要求: 要求.slice(0, 200) })
  }
  return 出
}

export interface 核对结论 {
  /** 通过 = 逐拍齐全且没触红线；偏离 = 有拍缺或有红线触犯；无法判定 = 模型反复不听话 */
  结论: "通过" | "偏离" | "无法判定"
  /** 只有「偏离」才阻断落盘 */
  符合: boolean
  偏离: string[]
  无法判定: string[]
  依据: string
  调试?: Array<{ 环节: string; 模型: string; 正文长度: number; 思考长度: number; 原文前100: string }>
}

const 取片段 = (值: any): string => String(值 ?? "").replace(/\s+/g, " ").slice(0, 40)

/** 核对调用的打点（模块级、顺序调用，核对大纲进入时清空）：实际模型 / 正文长度 / 思考长度 / 原文前 100 字 */
const 最近调试: Array<{ 环节: string; 模型: string; 正文长度: number; 思考长度: number; 原文前100: string }> = []
function 记调试(环节: string, 模型: string, 正文长度: number, 思考长度: number, 原文: string): void {
  最近调试.push({ 环节, 模型, 正文长度, 思考长度, 原文前100: String(原文 ?? "").slice(0, 100) })
}

/** 一次问模型（带一次重试：换个更窄的提示）。拿不到 JSON 就返回 null。 */
async function 问JSON(
  参数: Pick<多视角参数, "基址" | "密钥" | "模型" | "策略"> & { 核对模型?: string },
  系统: string,
  用户: string,
): Promise<any | null> {
  for (let 次 = 0; 次 < 2; 次++) {
    let 全部 = ""
    let 思考长 = 0
    const 用模型 = 参数.核对模型 ?? 参数.模型.审校
    try {
      await 流式对话({
        ...参数.策略,
        基址: 参数.基址,
        密钥: 参数.密钥,
        // 核对走专用非推理模型：推理模型的思考会吃光预算，导致永远拿不到 JSON
        模型: 参数.核对模型 ?? 参数.模型.审校,
        // 核对**绝不允许换模型**：兜底顺序里排着推理模型，一换就只剩思考、拿不到 JSON
        换模型: { 开关: false, 顺序: [] },
        消息: [
          { role: "system", content: 次 === 0 ? 系统 : 系统 + "\n只输出一行 JSON，不要解释、不要代码块、不要前言。" },
          { role: "user", content: 用户 },
        ],
        温度: 0,
        // 不给思考强度：有的网关/模型不认这个字段会直接 400；
        // 但预算要给足——推理型模型（cnwrokbuddy-ds）的思考会吃掉预算，给小了正文就是空的
        最大词元: 6000,
        回调: (类型, 片段) => {
          if (类型 === "正文") 全部 += 片段
          else if (类型 === "思考") 思考长 += String(片段).length
        },
      })
    } catch (错误: any) {
      记调试(用户.slice(0, 18).replace(/\s+/g, " ") + "（第" + (次 + 1) + "次报错）", 用模型, 全部.length, 思考长, String(错误?.message ?? 错误))
    }
    记调试(用户.slice(0, 18).replace(/\s+/g, " ") + "（第" + (次 + 1) + "次）", 用模型, 全部.length, 思考长, 全部)
    const 解析 = 取JSON(全部)
    if (解析) return 解析
  }
  return null
}

/**
 * 大纲核对（硬门槛，逐拍版）：细纲拆成拍，每 5 拍问一次「这一拍写到了吗」，红线单独一轮。
 * 三态：通过 / 偏离（有拍缺或触红线）/ 无法判定（模型反复不听话）；只有偏离阻断落盘。
 */
export async function 核对大纲(
  参数: Pick<多视角参数, "基址" | "密钥" | "模型" | "策略"> & { 核对模型?: string },
  纲要: 本章纲要,
  正文: string,
): Promise<核对结论> {
  const 文 = String(正文 ?? "")
  if (!文.trim()) return { 结论: "偏离", 符合: false, 偏离: ["没有成文，无法核对"], 无法判定: [], 依据: "" }
  const 拍们 = 拆拍(纲要)
  const 偏离: string[] = []
  const 无法判定: string[] = []
  const 依据们: string[] = []
  最近调试.length = 0

  if (拍们.length === 0) 无法判定.push("细纲里没有可拆的拍（①②③…），逐拍核对无法进行")
  for (let 起2 = 0; 起2 < 拍们.length; 起2 += 5) {
    const 批 = 拍们.slice(起2, 起2 + 5)
    const 清单 = 批.map((项) => 项.拍号 + ". " + 项.要求).join("\n")
    const 解析 = await 问JSON(
      参数,
      [
        "你是这本书的审校。逐拍核对：对下面每一拍，判断正文里是否真的写到了。",
        '只输出一行 JSON：{"结果":[{"拍号":1,"有":true,"依据":"正文里对应的原文片段，20 字以内"}]}',
        "规则：正文没写 = 有:false；宁可说没有，不要替正文脑补；每一拍都要给一条结果。",
      ].join("\n"),
      "【要核对的拍】\n" + 清单 + "\n\n【正文】\n" + 文.slice(0, 6000),
    )
    if (!解析 || !Array.isArray(解析.结果)) {
      无法判定.push("第 " + 批[0].拍号 + "-" + 批[批.length - 1].拍号 + " 拍：模型没给出可解析的结果")
      continue
    }
    for (const 项 of 批) {
      const 结果 = (解析.结果 as any[]).find((条) => Number(条?.拍号) === 项.拍号)
      if (!结果) {
        无法判定.push("第 " + 项.拍号 + " 拍：模型漏答")
        continue
      }
      const 有 = 结果.有 === true || String(结果.有).toLowerCase() === "true"
      if (!有) 偏离.push("第 " + 项.拍号 + " 拍没写到：" + 项.要求.slice(0, 50) + (结果.依据 ? "（模型说：" + 取片段(结果.依据) + "）" : ""))
      else if (结果.依据) 依据们.push("第" + 项.拍号 + "拍：「" + 取片段(结果.依据) + "」")
    }
  }

  if (纲要.禁项.length > 0) {
    const 解析 = await 问JSON(
      参数,
      [
        "你是这本书的审校。下面每一条都是本章红线（不许发生的事）。判断正文有没有触犯。",
        '只输出一行 JSON：{"触犯":[{"红线":"第几条","依据":"正文里触犯它的原文片段，20 字以内"}]}；一条都没触犯就输出 {"触犯":[]}。',
        "规则：拿不准就按没触犯处理，不要硬凑。",
      ].join("\n"),
      "【红线】\n" + 纲要.禁项.map((项, 序) => 序 + 1 + ". " + 项.slice(0, 160)).join("\n") + "\n\n【正文】\n" + 文.slice(0, 6000),
    )
    if (!解析 || !Array.isArray(解析.触犯)) {
      无法判定.push("红线：模型没给出可解析的结果")
    } else {
      for (const 项 of 解析.触犯) {
        const 条 = String(项?.红线 ?? "")
        const 序 = Number(条)
        const 原文 = 序 >= 1 && 序 <= 纲要.禁项.length ? 纲要.禁项[序 - 1] : 条
        偏离.push("触犯红线：" + String(原文).slice(0, 60) + (项?.依据 ? "（原文：" + 取片段(项.依据) + "）" : ""))
      }
    }
  }

  const 结论: 核对结论["结论"] = 偏离.length > 0 ? "偏离" : 无法判定.length > 0 ? "无法判定" : "通过"
  return { 结论, 符合: 结论 !== "偏离", 偏离, 无法判定, 依据: 依据们.slice(0, 18).join("；"), 调试: [...最近调试] }
}
/**

 * 多视角最小闭环：成文只返回给作者看，不写盘；核对「偏离」就把偏离项返回。
 */
export async function 跑多视角(参数: 多视角参数): Promise<多视角结果> {
  const 章 = 参数.章节号
  const 纲要 = 取本章纲要(参数.根目录, 章)
  if (!纲要.纲要) {
    const 说明 = "找不到第 " + 章 + " 章的细纲/大纲：先补 情节/ 下的细纲，再跑多视角"
    参数.推({ 阶段: "失败", 摘要: 说明 })
    return { 成功: false, 章节号: 章, 纲要, 在场: [], 各视角: [], 收敛: "", 正文: "", 大纲核对: { 结论: "偏离" as const, 符合: false, 偏离: [], 无法判定: [], 依据: "" }, 信息闸: { 下发: [], 卡住: [] }, 说明 }
  }
  参数.推({ 阶段: "纲要", 摘要: "ch" + 章 + (纲要.卷 ? "（" + 纲要.卷 + "）" : "") + " 纲要 " + 纲要.纲要.length + " 字，禁项 " + 纲要.禁项.length + " 条" })

  // 选在场：细纲点名的名单，最多 min(3, 阵容上限, 讨论人数)
  const 上限 = Math.max(1, Math.min(3, 参数.阵容上限 || 3, 参数.讨论人数 || 3))
  const 在场 = (纲要.在场名单.length > 0 ? 纲要.在场名单 : 参数.成员们.slice(0, 上限).map((项) => 项.名称)).slice(0, 上限)
  if (在场.length === 0) {
    const 说明 = "细纲里没有点名在场，集群里也没有成员"
    参数.推({ 阶段: "失败", 摘要: 说明 })
    return { 成功: false, 章节号: 章, 纲要, 在场: [], 各视角: [], 收敛: "", 正文: "", 大纲核对: { 结论: "偏离" as const, 符合: false, 偏离: [], 无法判定: [], 依据: "" }, 信息闸: { 下发: [], 卡住: [] }, 说明 }
  }
  参数.推({ 阶段: "在场", 摘要: 在场.join("、") })

  // 信息闸：只给「何时知道 ≤ 本章」的条目；未到期的记进卡住名单（绝不下发）
  const 知情 = 读知情(参数.根目录)
  const 信息闸 = { 下发: [] as string[], 卡住: [] as string[] }
  const 各视角: Array<{ 成员: string; 发言: string }> = []
  for (const 名 of 在场) {
    const 它的 = 知情.filter((项) => 项.人.includes(名) || 名.includes(项.人))
    const 可现在知 = 它的.filter((项) => 项.何时 !== null && 项.何时 <= 章)
    const 还没到 = 它的.filter((项) => 项.何时 === null || 项.何时 > 章)
    for (const 项 of 可现在知) 信息闸.下发.push(名 + "：" + 项.秘密 + "（ch" + 项.何时 + "）")
    for (const 项 of 还没到) 信息闸.卡住.push(名 + "：" + 项.秘密 + "（ch" + 项.何时 + " 才知道）")
    const 系统 = [
      "你是《" + (path.basename(参数.根目录) || "这本书") + "》里的人物「" + 名 + "」，此刻在第 " + 章 + " 章。",
      "用第一人称写你此时此刻会怎么做、说什么、心里想什么。限 200 字。",
      "只写你自己：不写别人的心理，不写你看不到的事，不推进剧情，不写旁白式总结。",
      "",
      "【你的档案】",
      角色卡(参数.根目录, 名),
      "",
      可现在知.length > 0 ? "【你此刻已经知道的事】\n" + 可现在知.map((项) => "· " + 项.秘密 + "：" + (项.知道什么 || "知道")).join("\n") : "【你此刻不知道清单外的任何秘密】",
      "",
      "【这一章正在发生什么（只给你能感知到的程度）】",
      纲要.纲要.slice(0, 1800),
    ].join("\n")
    let 发言 = ""
    try {
      发言 = await 流式对话({
        ...参数.策略,
        基址: 参数.基址,
        密钥: 参数.密钥,
        模型: 参数.模型.执笔,
        消息: [
          { role: "system", content: 系统 },
          { role: "user", content: "写你这一段（第一人称，200 字以内，只写你自己）。" },
        ],
        温度: 0.8,
        回调: () => {},
      })
    } catch (错误: any) {
      发言 = "（这一段没能生成：" + String(错误?.message ?? 错误).slice(0, 80) + "）"
    }
    各视角.push({ 成员: 名, 发言: String(发言).trim() })
    参数.推({ 阶段: "发言", 谁: 名, 摘要: String(发言).trim().slice(0, 60), 文本: String(发言).trim() })
  }

  // 总控收敛
  参数.推({ 阶段: "收敛", 摘要: "总编在收敛" })
  let 收敛 = ""
  try {
    收敛 = await 流式对话({
      ...参数.策略,
      基址: 参数.基址,
      密钥: 参数.密钥,
      模型: 参数.模型.总编,
      消息: [
        {
          role: "system",
          content: [
            "你是这本书的总编。把几位角色的第一人称发言收成「这一段怎么写」的要点。",
            "必须先对齐本章细纲：谁做了什么、先后顺序、留什么钩子。",
            "不许新增细纲之外的大事件；细纲里写了的代价与红线，一条不许省。",
            "输出 5-8 条要点，每条一行，不要写正文。",
          ].join("\n"),
        },
        {
          role: "user",
          content: "【本章纲要】\n" + 纲要.纲要 + "\n\n【红线/禁项】\n" + (纲要.禁项.join("\n") || "（无）") + "\n\n【各方第一人称】\n" + 各视角.map((项) => "【" + 项.成员 + "】" + 项.发言).join("\n\n"),
        },
      ],
      温度: 0.6,
      回调: () => {},
    })
  } catch (错误: any) {
    收敛 = "（收敛失败：" + String(错误?.message ?? 错误).slice(0, 80) + "）"
  }
  参数.推({ 阶段: "收敛", 摘要: "收敛完成 " + 收敛.length + " 字" })

  // 执笔成文
  参数.推({ 阶段: "成文", 摘要: "执笔在写" })
  let 正文 = ""
  try {
    正文 = await 流式对话({
      ...参数.策略,
      基址: 参数.基址,
      密钥: 参数.密钥,
      模型: 参数.执笔模型 ?? 参数.模型.执笔,
      消息: [
        {
          role: "system",
          content: [
            "你是这本书的执笔。按下面的要点写正文，第三人称全知视角，中文引号，每段以两个全角空格开头。",
            "硬约束：完全服从本章纲要与红线；不许新增细纲之外的大事件；不许出现禁项里点名的人与说法。",
            "篇幅 1500-2500 字，写不完就停在要点最后一条，别硬凑。",
          ].join("\n"),
        },
        { role: "user", content: "【本章纲要】\n" + 纲要.纲要 + "\n\n【红线/禁项】\n" + (纲要.禁项.join("\n") || "（无）") + "\n\n【收敛要点】\n" + 收敛 },
      ],
      温度: 0.85,
        // 成文要 1500-2500 字：单独抬到 8000 词元，免得写到一半被截断成空
        最大词元: Math.max(8000, Number(参数.策略?.最大词元) || 0),
      回调: () => {},
    })
  } catch (错误: any) {
    正文 = ""
    参数.推({ 阶段: "失败", 摘要: "成文失败：" + String(错误?.message ?? 错误).slice(0, 80) })
  }
  参数.推({ 阶段: "成文", 摘要: "正文 " + 正文.length + " 字" })

  // 大纲核对（硬门槛）
  参数.推({ 阶段: "核对", 摘要: "审校在核对" })
  const 核对 = await 核对大纲(参数, 纲要, 正文)
  参数.推({ 阶段: "核对", 摘要: 核对.符合 ? "符合大纲" : "不符合：" + 核对.偏离.join("；").slice(0, 80) })

  const 成功 = 核对.结论 !== "偏离" && 正文.trim().length > 0
  const 说明 =
    正文.trim().length === 0
      ? "成文失败，没有落盘"
      : 核对.结论 === "偏离"
        ? "偏离大纲，未落盘：" + 核对.偏离.join("；")
        : 核对.结论 === "无法判定"
          ? "成文已完成，但大纲核对没能验成（模型反复不听话），请人工看一眼：" + 核对.无法判定.join("；")
          : "多视角成文通过大纲核对（未落盘，等作者决定）"
  参数.推({ 阶段: 成功 ? "完成" : "失败", 摘要: 说明 })
  return { 成功, 章节号: 章, 纲要, 在场, 各视角, 收敛, 正文, 大纲核对: 核对, 信息闸, 说明 }
}