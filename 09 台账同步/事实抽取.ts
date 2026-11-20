// 只负责一件事：让模型把一章正文读成结构化事实，分两步问，句子短、好收敛。
import { 流式对话 } from "../04 模型接入/网关客户端"

export interface 抽取结果 {
  在场: string[]
  日期: string
  事件: string[]
  已兑现: Array<{ 编号: string; 说明: string }>
}

export interface 抽取参数 {
  基址: string
  密钥: string
  模型: string
  书名: string
  章节号: number
  标题: string
  正文: string
  待兑伏笔: string[]
}

function 取JSON(文本: string): any {
  const 去块 = 文本.replace(/```(?:json)?/gi, "").trim()
  const 末个右括号 = 去块.lastIndexOf("}")
  for (let 起 = 去块.lastIndexOf("{"); 起 >= 0; 起 = 去块.lastIndexOf("{", 起 - 1)) {
    if (起 > 末个右括号) continue
    try {
      const 对象 = JSON.parse(去块.slice(起, 末个右括号 + 1))
      if (对象 && typeof 对象 === "object") return 对象
    } catch {
      /* 继续往前找 */
    }
    if (起 === 0) break
  }
  throw new Error("模型没有返回可用 JSON，原文开头：" + 去块.slice(0, 200))
}

async function 问一次(参数: 抽取参数, 提示: string, 上限: number): Promise<any> {
  let 正文段 = ""
  let 全部段 = ""
  await 流式对话({
    基址: 参数.基址,
    密钥: 参数.密钥,
    模型: 参数.模型,
    消息: [
      { role: "system", content: "只输出 JSON。" },
      { role: "user", content: 提示 },
    ],
    温度: 0,
    最大词元: 上限,
    回调: (类型, 文本) => {
      全部段 += 文本
      if (类型 === "正文") 正文段 += 文本
    },
  })
  // 推理模型有时把答案写在思考里：先看正文，再退回全文。
  try {
    return 取JSON(正文段)
  } catch {
    return 取JSON(全部段)
  }
}

/** 第一步：谁在场、哪天、发生了什么。 */
export async function 抽取本章事实(参数: 抽取参数): Promise<抽取结果> {
  const 基础 = await 问一次(
    参数,
    [
      "读下面这章正文，只输出 JSON：",
      '{"在场":["人物全名"],"日期":"","事件":["按顺序，一句话一条"]}',
      "在场：本章真正露面或说话的人物，用原文全名；只在回忆或对话里提到的不算。",
      "日期：正文明确出现的日期，没有就空字符串。事件 3 到 8 条。",
      "",
      "正文：",
      参数.正文.slice(0, 6000),
    ].join("\n"),
    6000,
  )

  const 结果: 抽取结果 = {
    在场: Array.isArray(基础.在场) ? 基础.在场.map(String).filter(Boolean) : [],
    日期: typeof 基础.日期 === "string" ? 基础.日期.trim() : "",
    事件: Array.isArray(基础.事件) ? 基础.事件.map(String).filter(Boolean) : [],
    已兑现: [],
  }

  // 第二步：本章有没有把某条待兑伏笔真正兑现。清单一次只喂 8 条，问得越窄越准。
  const 分组: string[][] = []
  for (let i = 0; i < 参数.待兑伏笔.length; i += 8) 分组.push(参数.待兑伏笔.slice(i, i + 8))

  for (const 组 of 分组) {
    try {
      const 回答 = await 问一次(
        参数,
        [
          "对下面清单每一条，判断本章是否真正兑现，只输出 JSON：",
          '{"判定":[{"编号":"p-019","兑现":true,"依据":"原文里的一句话"}]}',
          "兑现为 true 必须能给出原文依据；给不出依据就写 false。编号照抄，不许自造。",
          "",
          "清单：" + 组.join("；"),
          "本章原文：" + 参数.正文.slice(-2500),
        ].join("\n"),
        6000,
      )
      const 判定们 = Array.isArray(回答.判定) ? 回答.判定 : []
      for (const 项 of 判定们) {
        const 编号 = String(项?.编号 ?? "")
        const 依据 = String(项?.依据 ?? "").trim()
        if (!/^p-\d+$/.test(编号)) continue
        if (项?.兑现 !== true || 依据.length < 4) continue
        if (结果.已兑现.some((已) => 已.编号 === 编号)) continue
        结果.已兑现.push({ 编号, 说明: 依据.slice(0, 120) })
      }
    } catch (错误: any) {
      console.error("[台账] 兑现判定失败：" + String(错误?.message ?? 错误).slice(0, 200))
    }
  }

  return 结果
}
