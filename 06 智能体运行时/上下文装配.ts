// 只负责一件事：给某个智能体装配这一次任务要看的材料（按设置截断单卡字数、附加技能）。
import path from "node:path"
import fs from "node:fs"
import { 读文本, 列目录 } from "../11 文件工作区/原子写"
import type { 集群成员 } from "./成员目录"
import type { 技能项 } from "../03 进程桥接/通道"
import { 查相关 } from "./会话簿"

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

/** 技能排在人格之后、档案之前；每条标上名字，模型才知道自己在用哪条规矩。 */
function 拼技能(技能?: 技能项[]): string {
  const 要用的 = (技能 ?? []).filter((项) => 项.默认附加 && 项.名称.trim() && 项.内容.trim())
  if (要用的.length === 0) return ""
  return 要用的.map((项) => "【技能：" + 项.名称.trim() + "】\n" + 项.内容.trim()).join("\n\n")
}

export async function 装配上下文(参数: 装配参数): Promise<{ 系统: string; 用户: string }> {
  const 单卡字数 = Math.max(120, Math.round(参数.单卡注入字数 ?? 默认单卡字数))
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
    档案段.length ? "\n【你负责的档案摘要】\n" + 档案段.join("\n\n") : "",
    黑板段 ? "\n" + 黑板段 : "",
  ]
    .filter(Boolean)
    .join("\n")

  return { 系统, 用户: 参数.任务 }
}
