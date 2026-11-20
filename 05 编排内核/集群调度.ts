// 只负责一件事：把一件活同时派给一群智能体，再让总编合成一份结论。
import { 执行成员 } from "../06 智能体运行时/执行器"
import type { 集群成员 } from "../06 智能体运行时/成员目录"
import type { 设置 } from "../03 进程桥接/通道"
import { 流式对话 } from "../04 模型接入/网关客户端"
import { 记一笔 } from "../06 智能体运行时/会话簿"

export interface 派活参数 {
  根目录: string
  数据目录: string
  书名: string
  章节号: number
  章节标题: string
  任务: string
  成员们: 集群成员[]
  设置: 设置
  并发?: number
  回调?: (事件: { 成员: string; 角色: string; 阶段: "开始" | "完成"; 完成数: number; 总数: number }) => void
}

export interface 派活结果 {
  任务: string
  用时毫秒: number
  各自: Array<{ 成员: string; 角色: string; 产出: string; 成功: boolean; 用时毫秒: number }>
  汇总: string
}

/** 同时最多跑几个，避免把网关打满。 */
async function 池<T, R>(项: T[], 并发: number, 函数: (值: T) => Promise<R>): Promise<R[]> {
  const 结果: R[] = new Array(项.length)
  let 下一个 = 0
  const 工人 = Array.from({ length: Math.min(并发, 项.length) }, async () => {
    for (;;) {
      const 序 = 下一个++
      if (序 >= 项.length) return
      结果[序] = await 函数(项[序])
    }
  })
  await Promise.all(工人)
  return 结果
}

/** 默认阵容：总编 + 伏笔 + 审校 + 出场最多的人物。 */
export function 选阵容(成员们: 集群成员[], 上限 = 9): 集群成员[] {
  const 固定 = 成员们.filter((x) => ["总编", "伏笔", "审校"].includes(x.角色))
  const 人物 = 成员们.filter((x) => x.角色 === "人物")
  return [...固定, ...人物].slice(0, 上限)
}

function 取关键词(参数: 派活参数): string[] {
  const 词 = new Set<string>()
  词.add("第" + 参数.章节号 + "章")
  词.add("ch" + 参数.章节号)
  for (const 词条 of 参数.任务.split(/[，。、；\s]/)) if (词条.length >= 2) 词.add(词条)
  for (const 人 of 参数.成员们.filter((x) => x.角色 === "人物")) 词.add(人.名称)
  return [...词].slice(0, 24)
}

export async function 派活(参数: 派活参数): Promise<派活结果> {
  const 起 = Date.now()
  const 阵容 = 参数.成员们
  const 关键词 = 取关键词(参数)

  let 完成数 = 0
  const 各自 = await 池(阵容, 参数.并发 ?? 4, async (成员) => {
    参数.回调?.({ 成员: 成员.名称, 角色: 成员.角色, 阶段: "开始", 完成数, 总数: 阵容.length })
    const 结果 = await 执行成员({
      根目录: 参数.根目录,
      数据目录: 参数.数据目录,
      成员,
      任务: 参数.任务,
      关键词,
      基址: 参数.设置.网关地址,
      密钥: 参数.设置.API密钥,
      模型: 成员.角色 === "总编" ? 参数.设置.分工.总编 : 成员.角色 === "审校" ? 参数.设置.分工.审校 : 参数.设置.分工.助手,
      章节号: 参数.章节号,
    })
    完成数++
    参数.回调?.({ 成员: 成员.名称, 角色: 成员.角色, 阶段: "完成", 完成数, 总数: 阵容.length })
    return { 成员: 结果.成员, 角色: 结果.角色, 产出: 结果.产出, 成功: 结果.成功, 用时毫秒: 结果.用时毫秒 }
  })

  const 有效 = 各自.filter((x) => x.成功)
  let 汇总 = ""
  if (有效.length > 0) {
    汇总 = await 合成开写包(参数, 有效)
  } else {
    汇总 = "没有一位负责人给出结论，先检查网关与模型配置。"
  }

  return { 任务: 参数.任务, 用时毫秒: Date.now() - 起, 各自, 汇总 }
}

async function 合成开写包(
  参数: 派活参数,
  有效: Array<{ 成员: string; 角色: string; 产出: string }>,
): Promise<string> {
  const 材料 = 有效.map((项) => "【" + 项.成员 + "｜" + 项.角色 + "】\n" + 项.产出.slice(0, 900)).join("\n\n")
  let 正文 = ""
  try {
    await 流式对话({
      基址: 参数.设置.网关地址,
      密钥: 参数.设置.API密钥,
      模型: 参数.设置.分工.总编,
      消息: [
        {
          role: "system",
          content:
            "你是总编。把各位负责人的回答合成一份「开写包」，只输出正式结论，不写过程。\n" +
            "格式固定四段：\n【本章目标】一句话\n【必须兑现】伏笔编号 + 怎么兑\n【不能写】红线与禁区\n【谁在场】名单\n篇幅控制在 400 字内。",
        },
        {
          role: "user",
          content: "书名《" + 参数.书名 + "》，第 " + 参数.章节号 + " 章《" + 参数.章节标题 + "》。\n任务：" + 参数.任务 + "\n\n" + 材料,
        },
      ],
      温度: 0.3,
      最大词元: 6000,
      回调: (类型, 文本) => {
        if (类型 === "正文") 正文 += 文本
      },
    })
  } catch (错误: any) {
    return "合成开写包失败：" + String(错误?.message ?? 错误).slice(0, 200) + "\n\n以下是原始回答：\n" + 材料
  }

  const 干净 = 正文.trim()
  记一笔(参数.数据目录, 参数.根目录, {
    时间: new Date().toISOString(),
    智能体: "总编",
    任务: "合成开写包：" + 参数.任务,
    产出: 干净.slice(0, 1200),
    章节: 参数.章节号,
  })
  return 干净
}
