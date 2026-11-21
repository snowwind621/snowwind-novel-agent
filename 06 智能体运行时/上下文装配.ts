// 只负责一件事：给某个智能体装配这一次任务要看的材料（按设置截断单卡字数、附加技能、上一章结尾）。
import path from "node:path"
import fs from "node:fs"
import { 读文本, 列目录 } from "../11 文件工作区/原子写"
import type { 集群成员 } from "./成员目录"
import type { 技能项, 设置 } from "../03 进程桥接/通道"
import { 查相关 } from "./会话簿"
import { 读设置 } from "../14 配置密钥/设置存储"
import { 路径, 解析卷目录, 解析章文件名 } from "../10 书库检索/书库布局"

export interface 装配参数 {
  根目录: string
  数据目录: string
  成员: 集群成员
  任务: string
  关键词: string[]
  /** 单张档案卡注入多少字；不给按 1200（与设置默认值一致） */
  单卡注入字数?: number
  /** 默认附加的技能，按设置里的顺序拼进系统提示 */
  技能?: 技能项[]
  /** 设置里的「上下文」组；不给就自己按数据目录去读 */
  上下文设置?: 设置["上下文"]
  /** 显式指定要不要注入上一章结尾（覆盖设置，主要给自检用） */
  注入上章结尾?: boolean
  /** 显式指定注入多少字（覆盖设置） */
  注入上章字数?: number
  /** 显式指定「这一章是第几章」：上一章 = 本章 - 1；不给就从任务里猜，再不行用书库最新章节 */
  章节号?: number | null
}

const 默认单卡字数 = 1200

/** 管辖项既可以是文件，也可以是一整个设定目录（取其中前三个）。 */
async function 读管辖(根目录: string, 相对: string, 单卡字数: number): Promise<string> {
  const 绝对 = path.join(根目录, 相对)
  let 是目录 = false
  try {
    是目录 = fs.statSync(绝对).isDirectory()
  } catch {
    return ""
  }

  if (!是目录) {
    const 正文 = await 读文本(绝对).catch(() => "")
    return 正文 ? "【" + 相对 + "】\n" + 去头(正文).slice(0, 单卡字数) : ""
  }

  // 目录里每份文件按单卡字数的四成左右截，三个文件加起来不超过一张卡的量级。
  const 每份 = Math.max(120, Math.round(单卡字数 * 0.44))
  const 文件们 = (await 列目录(绝对).catch(() => [])).filter((项) => !项.是目录 && 项.名称.endsWith(".md")).slice(0, 3)
  const 段: string[] = []
  for (const 项 of 文件们) {
    const 正文 = await 读文本(path.join(绝对, 项.名称)).catch(() => "")
    if (正文) 段.push("【" + 相对 + "/" + 项.名称 + "】\n" + 去头(正文).slice(0, 每份))
  }
  return 段.join("\n\n")
}

function 去头(正文: string): string {
  return 正文.replace(/^---[\s\S]*?---/, "").trim()
}

/** 上一章结尾的缓存：同一文件、同样字数、同样的 mtime 就不重读（派活时几个人共用一份）。 */
const 上章缓存 = new Map<string, string>()

/** 任务里常写「写第 27 章」，能猜出这次写的是哪章；猜不到就给 null。 */
function 从任务猜章号(任务: string): number | null {
  const 匹配 = /第\s*(\d{1,4})\s*章/.exec(String(任务 ?? ""))
  return 匹配 ? Number(匹配[1]) : null
}

/** 只读目录名与文件名，不读正文——扫描项目会把每章正文都读一遍，派活时太贵。 */
async function 列章节(根目录: string): Promise<Array<{ 编号: number; 文件: string }>> {
  const 出: Array<{ 编号: number; 文件: string }> = []
  const 正文根 = path.join(根目录, 路径.正文)
  for (const 卷 of await 列目录(正文根).catch(() => [])) {
    if (!卷.是目录 || 解析卷目录(卷.名称) === null) continue
    const 卷目录 = path.join(正文根, 卷.名称)
    for (const 项 of await 列目录(卷目录).catch(() => [])) {
      if (项.是目录) continue
      const 解析 = 解析章文件名(项.名称)
      if (解析) 出.push({ 编号: 解析.编号, 文件: path.join(卷目录, 项.名称) })
    }
  }
  return 出.sort((甲, 乙) => 甲.编号 - 乙.编号)
}

/** 按字符取最后 N 个字；截过就加一个省略号，让模型知道前面还有。 */
function 取尾(正文: string, 字数: number): string {
  const 净 = 正文.trim()
  if (!净) return ""
  const 字们 = Array.from(净)
  return 字们.length <= 字数 ? 净 : "…" + 字们.slice(字们.length - 字数).join("")
}

/**
 * 上一章结尾：让模型知道「刚写到哪」。
 * 位置：优先用调用方给的章号 - 1；否则从任务文字里猜；都没有就用书库最新章节。
 */
async function 取上章结尾(
  根目录: string,
  任务: string,
  章节号: number | null | undefined,
  字数: number,
): Promise<{ 章号: number; 结尾: string } | null> {
  const 章们 = await 列章节(根目录)
  if (章们.length === 0) return null
  const 最新 = 章们[章们.length - 1].编号
  // 本章章号：先看调用方给没给，再看任务文字；这一章是第 1 章就没有「上一章」
  const 本章 = 章节号 && 章节号 > 0 ? 章节号 : 从任务猜章号(任务)
  if (本章 !== null && 本章 <= 1) return null
  const 上章号 = 本章 !== null ? Math.min(本章 - 1, 最新) : 最新
  const 命中 = 章们.find((章) => 章.编号 === 上章号)
  if (!命中) return null
  let 时刻 = 0
  try {
    时刻 = fs.statSync(命中.文件).mtimeMs
  } catch {
    return null
  }
  const 键 = 命中.文件 + "|" + 字数 + "|" + 时刻
  const 旧 = 上章缓存.get(键)
  if (旧 !== undefined) return { 章号: 上章号, 结尾: 旧 }
  const 正文 = await 读文本(命中.文件).catch(() => "")
  const 结尾 = 取尾(去头(正文), 字数)
  上章缓存.set(键, 结尾)
  return { 章号: 上章号, 结尾 }
}

/** 技能排在人格之后、档案之前；每条标上名字，模型才知道自己在用哪条规矩。 */
function 拼技能(技能?: 技能项[]): string {
  const 要用的 = (技能 ?? []).filter((项) => 项.默认附加 && 项.名称.trim() && 项.内容.trim())
  if (要用的.length === 0) return ""
  return 要用的.map((项) => "【技能：" + 项.名称.trim() + "】\n" + 项.内容.trim()).join("\n\n")
}

export async function 装配上下文(参数: 装配参数): Promise<{ 系统: string; 用户: string }> {
  const 单卡字数 = Math.max(120, Math.round(参数.单卡注入字数 ?? 默认单卡字数))
  const 上下文设置 = 参数.上下文设置 ?? 读设置(参数.数据目录).上下文

  // 上一章结尾：设置里开着才带；关掉就完全不碰磁盘
  const 要上章 = 参数.注入上章结尾 ?? 上下文设置.注入上章结尾 !== false
  const 上章字数 = Math.max(100, Math.round(参数.注入上章字数 ?? 上下文设置.注入上章字数 ?? 400))
  const 上章 = 要上章 ? await 取上章结尾(参数.根目录, 参数.任务, 参数.章节号, 上章字数) : null

  const 档案段: string[] = []
  for (const 相对 of 参数.成员.管辖.slice(0, 3)) {
    const 段 = await 读管辖(参数.根目录, 相对, 单卡字数)
    if (段) 档案段.push(段)
  }

  const 相关 = 查相关(参数.数据目录, 参数.根目录, 参数.关键词, 5)
  const 黑板段 = 相关.length
    ? "【其他智能体最近的相关记录】\n" + 相关.map((条) => "- " + 条.智能体 + "｜" + 条.任务 + "：" + 条.产出.slice(0, 160)).join("\n")
    : ""

  const 系统 = [
    参数.成员.人格,
    拼技能(参数.技能),
    "纪律：事实只以档案与台账为准；不确定就写「未定」，不要编；每条结论不超过三行；不要复述任务，直接给结论。",
    "如果你认为某条设定或台账需要改，请另起一行用「建议：」开头写一条，写清改什么、依据是什么；没有就不要写。",
    上章 && 上章.结尾 ? "\n【上一章结尾（第 " + 上章.章号 + " 章 · 最后 " + 上章字数 + " 字）】\n" + 上章.结尾 : "",
    档案段.length ? "\n【你负责的档案摘要】\n" + 档案段.join("\n\n") : "",
    黑板段 ? "\n" + 黑板段 : "",
  ]
    .filter(Boolean)
    .join("\n")

  return { 系统, 用户: 参数.任务 }
}
