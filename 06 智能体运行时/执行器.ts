// 只负责一件事：让一个智能体把一次任务干完，并把过程记进会话簿。
import { 流式对话 } from "../04 模型接入/网关客户端"
import type { 调用策略 } from "../04 模型接入/网关客户端"
import type { 集群成员 } from "./成员目录"
import { 装配上下文 } from "./上下文装配"
import { 记一笔 } from "./会话簿"
import type { 技能项 } from "../03 进程桥接/通道"

export interface 执行参数 {
  根目录: string
  数据目录: string
  成员: 集群成员
  任务: string
  关键词: string[]
  基址: string
  密钥: string
  模型: string
  /** 超时/重试/温度/词元，来自设置里的「模型」组 */
  策略?: 调用策略
  /** 单张档案卡注入多少字，来自设置里的「上下文」组 */
  单卡注入字数?: number
  /** 要附加进系统提示的技能，来自设置里的「智能体」组 */
  技能?: 技能项[]
  章节号?: number
}

export interface 执行结果 {
  成员: string
  角色: string
  产出: string
  用时毫秒: number
  成功: boolean
}

export async function 执行成员(参数: 执行参数): Promise<执行结果> {
  const 起 = Date.now()
  const { 系统, 用户 } = await 装配上下文({
    根目录: 参数.根目录,
    数据目录: 参数.数据目录,
    成员: 参数.成员,
    任务: 参数.任务,
    关键词: 参数.关键词,
    单卡注入字数: 参数.单卡注入字数,
    技能: 参数.技能,
    // 改写某一章时要注入「上一章」，所以得让装配知道现在是第几章
    章节号: 参数.章节号,
  })

  let 正文 = ""
  try {
    await 流式对话({
      ...参数.策略,
      基址: 参数.基址,
      密钥: 参数.密钥,
      模型: 参数.模型,
      消息: [
        { role: "system", content: 系统 },
        { role: "user", content: 用户 },
      ],
      回调: (类型, 文本) => {
        if (类型 === "正文") 正文 += 文本
      },
    })
    const 干净 = 正文.trim()
    if (!干净) throw new Error("模型没有给正文")
    记一笔(参数.数据目录, 参数.根目录, {
      时间: new Date().toISOString(),
      智能体: 参数.成员.名称,
      任务: 参数.任务,
      产出: 干净.slice(0, 1200),
      章节: 参数.章节号,
    })
    return { 成员: 参数.成员.名称, 角色: 参数.成员.角色, 产出: 干净, 用时毫秒: Date.now() - 起, 成功: true }
  } catch (错误: any) {
    return {
      成员: 参数.成员.名称,
      角色: 参数.成员.角色,
      产出: "没能完成：" + String(错误?.message ?? 错误).slice(0, 160),
      用时毫秒: Date.now() - 起,
      成功: false,
    }
  }
}
