// 只负责一件事：定义 agent 能调用的工具、校验参数、守住「写盘先确认」，并把结果回灌成文本。
//
// 工具名给模型看的是英文（OpenAI 的 tools 字段只认 [a-zA-Z0-9_-]），中文名用于界面显示与退化解析。

import type { 工具声明 } from "../04 模型接入/网关客户端"
import type { 工具回执 } from "../03 进程桥接/通道"

export interface 参数说明 {
  类型: "字符串" | "数字"
  必填?: boolean
  说明: string
}

export interface 工具定义 {
  名称: string
  中文名: string
  说明: string
  /** 会不会落盘（写盘工具必须先得到用户确认） */
  写盘: boolean
  参数: Record<string, 参数说明>
}

export const 工具表: 工具定义[] = [
  {
    名称: "continue_writing",
    中文名: "续写",
    说明: "接着这一章已有正文往下写一段，只返回生成的正文，不改任何文件；写不写回正文由作者决定。",
    写盘: false,
    参数: {
      章节号: { 类型: "数字", 必填: true, 说明: "要续写第几章（整数章号，例如 27）" },
      指令: { 类型: "字符串", 说明: "往哪儿写、大概写多少、语气怎么走；留空就按默认 600 字" },
      字数上限: { 类型: "数字", 说明: "这次最多生成多少字，不给按 600" },
    },
  },
  {
    名称: "rewrite_passage",
    中文名: "改写",
    说明: "按作者的要求重写给定的一段原文，只返回改写后的正文，不改任何文件。",
    写盘: false,
    参数: {
      章节号: { 类型: "数字", 必填: true, 说明: "这段原文属于第几章" },
      原文: { 类型: "字符串", 必填: true, 说明: "要被改写的那一段原文，原样抄进来" },
      要求: { 类型: "字符串", 必填: true, 说明: "怎么改：更冷、更紧、删掉解释、换视角…" },
    },
  },
  {
    名称: "sync_ledger",
    中文名: "同步台账",
    说明: "把这一章正文里的事实抽出来写回台账（时间线、出场追踪、承诺兑现等），会落盘并做一次 Git 提交。属于写盘工具。",
    写盘: true,
    参数: {
      章节号: { 类型: "数字", 必填: true, 说明: "要同步第几章的台账" },
    },
  },
  {
    名称: "dispatch_cluster",
    中文名: "派活",
    说明: "把一件活派给智能体集群，让各负责人分头回答、总编合成开写包。会写开写包与派活归档（并提交）。属于写盘工具。",
    写盘: true,
    参数: {
      任务: { 类型: "字符串", 必填: true, 说明: "要派的那件活，一句话说清目标" },
      章节号: { 类型: "数字", 说明: "针对第几章，不给就用最新章节" },
    },
  },
  {
    名称: "read_file",
    中文名: "读文件",
    说明: "读书库里任意一个文件（设定、台账、正文、情节…），路径写相对于书库根目录的那一段。",
    写盘: false,
    参数: {
      路径: { 类型: "字符串", 必填: true, 说明: "相对书库根目录的路径，例如 台账/承诺台账.md" },
      字数上限: { 类型: "数字", 说明: "最多回多少字，默认 4000" },
    },
  },
  {
    名称: "query_ledger",
    中文名: "查台账",
    说明: "按册查台账，返回结构化行（列名 → 值），别自己用正则抠表格。",
    写盘: false,
    参数: {
      台账: { 类型: "字符串", 说明: "哪一册：时间线 / 出场追踪 / 关系线 / 属性变更 / 队伍状态 / 物品台账 / 承诺台账；留空＝全部" },
      关键词: { 类型: "字符串", 说明: "只返回含这个词的行（可选，比如人物名）" },
    },
  },
  {
    名称: "query_setting",
    中文名: "查设定",
    说明: "按名字模糊查设定卡（人物/地点/物品/规则…），返回卡片字段与正文开头。",
    写盘: false,
    参数: {
      名: { 类型: "字符串", 必填: true, 说明: "设定名或别名，例如「三叶」「鹦桥镇」" },
    },
  },
  {
    名称: "query_foreshadow",
    中文名: "查伏笔",
    说明: "返回伏笔的状态机结果（埋章/兑章/搁置章数/参考间隔/超期/久置），和看板同一套算法。",
    写盘: false,
    参数: {
      只看: { 类型: "字符串", 说明: "待兑现 / 已兑现 / 超期 / 久置 / 全部，默认「待兑现」" },
    },
  },
  {
    名称: "query_knowledge",
    中文名: "查知情",
    说明: "查「谁知道哪条秘密、什么时候知道的」：返回每条秘密的知情名单、不知情的人、依据；可限定截至第几章。",
    写盘: false,
    参数: {
      秘密: { 类型: "字符串", 说明: "只看这条秘密（模糊匹配名称），留空＝全部" },
      人: { 类型: "字符串", 说明: "只看这个人相关的条目（模糊匹配人名）" },
      截至章: { 类型: "数字", 说明: "只算截至第几章已经知道的；留空＝按全书算" },
    },
  },
  {
    名称: "write_chapter",
    中文名: "写章节",
    说明: "把整章正文覆盖写成给定内容并提交。会改动正文文件，属于写盘工具，必须先得到作者确认。",
    写盘: true,
    参数: {
      章节号: { 类型: "数字", 必填: true, 说明: "要写第几章" },
      正文: { 类型: "字符串", 必填: true, 说明: "这一章完整的正文（Markdown 纯文本，段首两个全角空格）" },
    },
  },
]

/** OpenAI 要求的 tools 字段；参数用 JSON Schema 描述，说明里写清中文口径。 */
export function 工具声明们(): 工具声明[] {
  return 工具表.map((工具) => {
    const 属性: Record<string, unknown> = {}
    const 必填: string[] = []
    for (const [键, 说明] of Object.entries(工具.参数)) {
      属性[键] = { type: 说明.类型 === "数字" ? "number" : "string", description: 说明.说明 }
      if (说明.必填) 必填.push(键)
    }
    return {
      type: "function" as const,
      function: {
        name: 工具.名称,
        description: 工具.说明 + (工具.写盘 ? "（写盘工具：执行前需要作者在对话里说「确认」）" : ""),
        parameters: { type: "object", properties: 属性, required: 必填 },
      },
    }
  })
}

/** 模型可能给英文名，约定块里可能是中文名；两边都认。 */
export function 按名找(名: string): 工具定义 | null {
  const 键 = String(名 ?? "").trim().toLowerCase()
  if (!键) return null
  return 工具表.find((工具) => 工具.名称.toLowerCase() === 键 || 工具.中文名 === 名.trim()) ?? null
}

function 试JSON(文本: string): unknown {
  try {
    return JSON.parse(文本)
  } catch {
    return null
  }
}

export function 校验参数(定义: 工具定义, 原始: unknown): { 参数: Record<string, unknown> } | { 错误: string } {
  const 值 = typeof 原始 === "string" ? 试JSON(原始) : 原始
  if (值 === null || typeof 值 !== "object" || Array.isArray(值)) return { 错误: "参数必须是 JSON 对象" }
  const 出: Record<string, unknown> = {}
  for (const [键, 说明] of Object.entries(定义.参数)) {
    const 原 = (值 as Record<string, unknown>)[键]
    if (原 === undefined || 原 === null || 原 === "") {
      if (说明.必填) return { 错误: "缺少参数「" + 键 + "」——" + 说明.说明 }
      continue
    }
    if (说明.类型 === "数字") {
      const 数 = Number(原)
      if (!Number.isFinite(数)) return { 错误: "参数「" + 键 + "」要是数字——" + 说明.说明 }
      出[键] = 数
    } else {
      出[键] = String(原)
    }
  }
  return { 参数: 出 }
}

/** 写盘工具的确认闸：用户这一句里得有明确的同意词，光说「同步台账」不算。 */
export function 已确认(用户输入: string): boolean {
  const 文 = String(用户输入 ?? "").trim()
  if (!文) return false
  return /(确认|确定|批准|同意|执行|动手|就这样|开始吧|可以了|存吧|写吧|就这么办)/.test(文)
}

/** 退化通道：模型不会用 tool_calls 时，让它输出 ```json {"工具":"续写","参数":{…}} ```。 */
export function 解析约定块(文本: string): Array<{ 名称: string; 参数: unknown }> {
  const 出: Array<{ 名称: string; 参数: unknown }> = []
  const 围栏 = /```(?:json)?\s*([\s\S]*?)```/g
  let 匹配: RegExpExecArray | null
  while ((匹配 = 围栏.exec(String(文本 ?? ""))) !== null) {
    const 值 = 试JSON(匹配[1].trim())
    if (值 === null) continue
    for (const 条 of Array.isArray(值) ? 值 : [值]) {
      if (!条 || typeof 条 !== "object") continue
      const 记录 = 条 as Record<string, unknown>
      const 名 = String(记录.工具 ?? 记录.tool ?? 记录.name ?? "").trim()
      if (!名) continue
      const 原始参数 = 记录.参数 ?? 记录.arguments ?? {}
      出.push({ 名称: 名, 参数: typeof 原始参数 === "string" ? (试JSON(原始参数) ?? {}) : 原始参数 })
    }
  }
  return 出
}

/** 真正干活的六个函数由主进程注入（它们要摸书库与集群，不该塞进这个纯模块）。 */
export interface 工具环境 {
  用户输入: string
  续写: (章节号: number, 指令: string, 字数上限: number) => Promise<string>
  改写: (章节号: number, 原文: string, 要求: string) => Promise<string>
  同步台账: (章节号: number) => Promise<{ 成功: boolean; 说明: string }>
  派活: (任务: string, 章节号: number) => Promise<{ 汇总: string; 各自: unknown[] }>
  读文件: (路径: string, 字数上限: number) => Promise<{ 文本: string; 是文本: boolean }>
  查台账: (台账: string, 关键词: string) => Promise<{ 文本: string; 行数: number }>
  查设定: (名: string) => Promise<{ 文本: string; 找到: boolean }>
  查伏笔: (只看: string) => Promise<string>
  查知情: (秘密: string, 人: string, 截至章: number | null) => Promise<string>
  写章节: (章节号: number, 正文: string) => Promise<{ 成功: boolean; 说明: string }>
}

export interface 执行结果 {
  需要确认: boolean
  回灌: string
  回执: 工具回执
}

/** 参数进界面之前先瘦身：正文那种几万字的字段只留个头。 */
function 摘要参数(参数: Record<string, unknown>): Record<string, unknown> {
  const 出: Record<string, unknown> = {}
  for (const [键, 值] of Object.entries(参数)) {
    const 文本 = typeof 值 === "string" ? 值 : String(值)
    出[键] = 文本.length > 60 ? 文本.slice(0, 60) + "…（" + 文本.length + " 字）" : 值
  }
  return 出
}

function 收尾(定义: 工具定义, 参数: Record<string, unknown>, 轮次: number, 正文: string, 摘要?: string): 执行结果 {
  const 太长 = 正文.length > 4000
  return {
    需要确认: false,
    回灌: "【工具 " + 定义.中文名 + " 的结果】\n" + (太长 ? 正文.slice(0, 4000) + "\n…（结果太长，截到这里）" : 正文),
    回执: {
      名称: 定义.名称,
      中文名: 定义.中文名,
      参数: 摘要参数(参数),
      状态: "完成",
      轮次,
      结果字数: 正文.length,
      摘要,
    },
  }
}

export async function 跑工具(名: string, 原始参数: unknown, 环境: 工具环境, 轮次: number): Promise<执行结果> {
  const 定义 = 按名找(名)
  if (!定义) {
    const 可用 = 工具表.map((工具) => 工具.中文名 + "(" + 工具.名称 + ")").join("、")
    return {
      需要确认: false,
      回灌: "没有这个工具：「" + String(名) + "」。可用工具只有：" + 可用 + "。请换一个，或者直接回答作者。",
      回执: { 名称: String(名), 中文名: String(名), 参数: {}, 状态: "失败", 轮次, 摘要: "工具不存在" },
    }
  }

  const 校验 = 校验参数(定义, 原始参数)
  if ("错误" in 校验) {
    return {
      需要确认: false,
      回灌: "工具「" + 定义.中文名 + "」的参数不合格：" + 校验.错误 + "。改好参数再来一次。",
      回执: { 名称: 定义.名称, 中文名: 定义.中文名, 参数: {}, 状态: "失败", 轮次, 摘要: 校验.错误 },
    }
  }
  const 参数 = 校验.参数

  if (定义.写盘 && !已确认(环境.用户输入)) {
    const 提醒 =
      "需要确认：工具「" +
      定义.中文名 +
      "」会写盘（" +
      (定义.名称 === "write_chapter" ? "覆盖正文并提交" : 定义.名称 === "sync_ledger" ? "写台账并提交" : "写开写包并提交") +
      "）。请你回一句「确认」，我再动手。"
    return {
      需要确认: true,
      回灌: 提醒,
      回执: { 名称: 定义.名称, 中文名: 定义.中文名, 参数: 摘要参数(参数), 状态: "待确认", 轮次, 摘要: "写盘工具，等作者确认" },
    }
  }

  try {
    switch (定义.名称) {
      case "continue_writing": {
        const 正文 = await 环境.续写(Number(参数.章节号), String(参数.指令 ?? ""), Number(参数.字数上限 ?? 600))
        return 收尾(定义, 参数, 轮次, 正文, "续写完成，未写盘")
      }
      case "rewrite_passage": {
        const 正文 = await 环境.改写(Number(参数.章节号), String(参数.原文), String(参数.要求))
        return 收尾(定义, 参数, 轮次, 正文, "改写完成，未写盘")
      }
      case "sync_ledger": {
        const 结果 = await 环境.同步台账(Number(参数.章节号))
        return 收尾(定义, 参数, 轮次, 结果.说明, 结果.成功 ? "台账已同步" : "台账同步失败")
      }
      case "dispatch_cluster": {
        const 结果 = await 环境.派活(String(参数.任务), Number(参数.章节号 ?? 0))
        const 正文 = String(结果.汇总 ?? "") + "\n\n（" + (结果.各自?.length ?? 0) + " 位负责人参加）"
        return 收尾(定义, 参数, 轮次, 正文, "集群已跑完，开写包已落盘")
      }
      case "read_file": {
        const 结果 = await 环境.读文件(String(参数.路径), Number(参数.字数上限 ?? 4000))
        if (!结果.是文本) return 收尾(定义, 参数, 轮次, "（不是文本文件，读不了）", "非文本")
        return 收尾(定义, 参数, 轮次, 结果.文本, "已读 " + 结果.文本.length + " 字")
      }
      case "query_ledger": {
        const 数据 = await 环境.查台账(String(参数.台账 ?? ""), String(参数.关键词 ?? ""))
        return 收尾(定义, 参数, 轮次, 数据.文本, "共 " + 数据.行数 + " 行")
      }
      case "query_setting": {
        const 数据 = await 环境.查设定(String(参数.名))
        return 收尾(定义, 参数, 轮次, 数据.文本, 数据.找到 ? "命中 1 张卡" : "没找到这张卡")
      }
      case "query_knowledge": {
        const 文本 = await 环境.查知情(String(参数.秘密 ?? ""), String(参数.人 ?? ""), 参数.截至章 === undefined ? null : Number(参数.截至章))
        return 收尾(定义, 参数, 轮次, 文本, "已按知情状态汇总")
      }
      case "query_foreshadow": {
        const 文本 = await 环境.查伏笔(String(参数.只看 ?? ""))
        return 收尾(定义, 参数, 轮次, 文本, "已按状态机汇总")
      }
      case "write_chapter": {
        const 结果 = await 环境.写章节(Number(参数.章节号), String(参数.正文))
        return 收尾(定义, 参数, 轮次, 结果.说明, 结果.成功 ? "正文已写盘" : "写盘失败")
      }
      default:
        return {
          需要确认: false,
          回灌: "工具「" + 定义.中文名 + "」还没接上实现。",
          回执: { 名称: 定义.名称, 中文名: 定义.中文名, 参数: 摘要参数(参数), 状态: "失败", 轮次, 摘要: "未实现" },
        }
    }
  } catch (错误: any) {
    const 说明 = String(错误?.message ?? 错误).slice(0, 200)
    return {
      需要确认: false,
      回灌: "工具「" + 定义.中文名 + "」执行失败：" + 说明,
      回执: { 名称: 定义.名称, 中文名: 定义.中文名, 参数: 摘要参数(参数), 状态: "失败", 轮次, 摘要: 说明 },
    }
  }
}
