// 只负责一件事：把「讨论」放在服务端跑——几个人各说一轮、总编收口、结果归档进 讨论/。
// 前端只订阅进度；页面刷新不打断（讨论不依赖任何客户端状态）。

import fs from "node:fs"
import path from "node:path"
import type { 技能项, 讨论进度 as 通道讨论进度 } from "../03 进程桥接/通道"
import type { 集群成员 } from "../06 智能体运行时/成员目录"
import { 路径 } from "../10 书库检索/书库布局"
import { 选阵容 } from "./集群调度"
import { 执行成员 } from "../06 智能体运行时/执行器"
import { 流式对话 } from "../04 模型接入/网关客户端"
import type { 调用策略 } from "../04 模型接入/网关客户端"
import { 提交 } from "../11 文件工作区/Git提交"

export type 讨论进度 = 通道讨论进度

export interface 讨论参数 {
  根目录: string
  数据目录: string
  话题: string
  章节号: number
  成员们: 集群成员[]
  阵容上限: number
  讨论人数: number
  基址: string
  密钥: string
  模型: string
  策略: 调用策略
  单卡注入字数: number
  技能: 技能项[]
  推: (进度: 讨论进度) => void
}

export interface 讨论结果 {
  成功: boolean
  归档: string
  发言: Array<{ 成员: string; 角色: string; 产出: string }>
  收口: string
  说明: string
}

/** 一位成员的一轮发言：复用执行器，免得讨论和派活用两套上下文装配。 */
async function 发言(参数: 讨论参数, 成员: 集群成员, 已说过: string): Promise<{ 成员: string; 角色: string; 产出: string }> {
  const 任务 = [
    "【讨论，不写文件】话题：" + 参数.话题,
    已说过 ? "前面别人说过（不要重复，只补新角度或明确反对）：\n" + 已说过 : "",
    "只给判断和理由，三到六句，不要写正文。",
  ]
    .filter(Boolean)
    .join("\n")
  const 结果 = await 执行成员({
    根目录: 参数.根目录,
    数据目录: 参数.数据目录,
    成员,
    任务,
    关键词: 参数.话题.split(/[，。、\s]+/).filter(Boolean).slice(0, 8),
    基址: 参数.基址,
    密钥: 参数.密钥,
    模型: 参数.模型,
    策略: 参数.策略,
    单卡注入字数: 参数.单卡注入字数,
    技能: 参数.技能,
    章节号: 参数.章节号,
  })
  return { 成员: String(结果.成员 ?? 成员.名称), 角色: String(结果.角色 ?? 成员.角色), 产出: String(结果.产出 ?? "").trim() }
}

/** 服务端跑一场讨论：串行发言（模型并发会互相抢上下文），最后总编收口，归档。 */
export async function 跑讨论(参数: 讨论参数): Promise<讨论结果> {
  const 阵容 = 选阵容(参数.成员们, 参数.阵容上限).slice(0, Math.max(1, 参数.讨论人数))
  if (阵容.length === 0) {
    const 说明 = "集群里没有可用的成员（先建几个成员再讨论）"
    参数.推({ 阶段: "失败", 摘要: 说明 })
    return { 成功: false, 归档: "", 发言: [], 收口: "", 说明 }
  }
  参数.推({ 阶段: "开始", 摘要: "「" + 参数.话题 + "」·" + 阵容.length + " 位发言" })

  const 发言们: Array<{ 成员: string; 角色: string; 产出: string }> = []
  for (const 成员 of 阵容) {
    try {
      const 条 = await 发言(参数, 成员, 发言们.map((项) => 项.成员 + "：" + 项.产出.slice(0, 200)).join("\n"))
      发言们.push(条)
      参数.推({ 阶段: "发言", 谁: 条.成员, 角色: 条.角色, 摘要: 条.产出.slice(0, 80), 文本: 条.产出 })
    } catch (错误: any) {
      const 说明 = String(错误?.message ?? 错误).slice(0, 120)
      发言们.push({ 成员: 成员.名称, 角色: 成员.角色, 产出: "（这一位没能发言：" + 说明 + "）" })
      参数.推({ 阶段: "发言", 谁: 成员.名称, 角色: 成员.角色, 摘要: "发言失败：" + 说明 })
    }
  }

  let 收口 = ""
  try {
    参数.推({ 阶段: "收口", 摘要: "总编在收口" })
    收口 = await 流式对话({
      ...参数.策略,
      基址: 参数.基址,
      密钥: 参数.密钥,
      模型: 参数.模型,
      消息: [
        {
          role: "system",
          content: "你是这本书的总编。把下面几位的意见收成一段结论：先给判断，再列 1-3 条理由，最后给下一步动作。不要复述每个人的话，不要写正文。",
        },
        { role: "user", content: "话题：" + 参数.话题 + "\n\n" + 发言们.map((项) => "【" + 项.成员 + "（" + 项.角色 + "）】" + 项.产出).join("\n\n") },
      ],
      温度: 0.5,
      回调: () => {},
    })
  } catch (错误: any) {
    收口 = "（收口失败：" + String(错误?.message ?? 错误).slice(0, 120) + "）"
  }

  const 日期 = new Date()
  const 干净 = 参数.话题.replace(/[\\/:*?"<>|]/g, "_").slice(0, 30) || "讨论"
  const 相对 = 路径.讨论 + "/" + 日期.toISOString().slice(0, 10) + " " + 干净 + ".md"
  const 文件 = path.join(参数.根目录, 相对)
  try {
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    fs.writeFileSync(
      文件,
      [
        "# 讨论：" + 参数.话题,
        "",
        "> " + 日期.toLocaleString("zh-CN") + " · 服务端讨论 · " + 发言们.length + " 位发言 · 涉及 ch" + 参数.章节号,
        "",
        "## 各方意见",
        "",
        ...发言们.map((项) => "### " + 项.成员 + "（" + 项.角色 + "）\n\n" + 项.产出 + "\n"),
        "## 收口",
        "",
        收口 || "（没有收口）",
        "",
      ].join("\n"),
      "utf8",
    )
  } catch (错误: any) {
    const 说明 = "归档失败：" + String(错误?.message ?? 错误).slice(0, 120)
    参数.推({ 阶段: "失败", 摘要: 说明 })
    return { 成功: false, 归档: "", 发言: 发言们, 收口, 说明 }
  }

  await 提交(参数.根目录, "讨论：" + 参数.话题.slice(0, 40), [相对]).catch(() => {})
  参数.推({ 阶段: "完成", 摘要: 相对, 文本: 收口 })
  return { 成功: true, 归档: 相对, 发言: 发言们, 收口, 说明: "讨论已归档：" + 相对 }
}
