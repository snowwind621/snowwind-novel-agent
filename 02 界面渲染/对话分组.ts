// 只负责一件事：把对话条目归一成「普通消息 / 过程组」的显示项，过程卡标题与活动都从这里算。
// 布局参考 OpenFic（Apache-2.0）：连续的过程消息合并成一张卡；实现是本项目自写。
import type { 对话条目 } from "./接口"
import type { 图标名 } from "./图标"

/** 过程的「活动」：决定卡头图标与标题措辞。 */
export type 活动类 = "思考" | "读取" | "搜索" | "写" | "派活" | "计划" | "问" | "工具"

export type 显示项 =
  | { 类型: "消息"; 条: 对话条目 }
  | { 类型: "过程"; 条们: 对话条目[] }

/** 一条条目算不算「过程」：思考与工具回执都算。 */
export function 是过程(条: 对话条目): boolean {
  if (条.工具) return true
  if (条.思考 && 条.思考.trim()) return true
  return false
}

const 含 = (文本: string, 词们: string[]): boolean => 词们.some((词) => 文本.includes(词))

/** 工具名 → 活动类（按动词/领域粗分，认不出就落「工具」）。 */
export function 取活动(条: 对话条目): 活动类 {
  if (!条.工具) return "思考"
  const 名 = (条.工具.中文名 || 条.工具.名称 || "").toLowerCase()
  if (含(名, ["问", "ask", "confirm"])) return "问"
  if (含(名, ["计划", "plan"])) return "计划"
  if (含(名, ["派", "agent", "子智能体", "集群"])) return "派活"
  if (含(名, ["续写", "改写", "写章", "write", "chapter_write"])) return "写"
  if (含(名, ["伏笔", "知情", "search", "查证", "搜"])) return "搜索"
  if (含(名, ["read", "读", "ledger", "台账", "setting", "设定", "timeline", "时间线"])) return "读取"
  return "工具"
}

const 活动图标: Record<活动类, 图标名> = {
  思考: "脑",
  读取: "书",
  搜索: "放大镜",
  写: "笔",
  派活: "机器人",
  计划: "清单",
  问: "问号",
  工具: "扳手",
}

/** 一张过程卡该用哪个图标：看最后一个过程条目的活动。 */
export function 过程图标(条们: 对话条目[]): 图标名 {
  const 尾 = 条们[条们.length - 1]
  return 尾 ? 活动图标[取活动(尾)] : "扳手"
}

/** 过程里最后一次「正在干什么」的那句话。 */
export function 进行中标题(条们: 对话条目[]): string {
  const 尾 = 条们[条们.length - 1]
  if (!尾) return "正在思考…"
  const 活动 = 取活动(尾)
  if (活动 === "思考") return "正在思考…"
  const 名 = 尾.工具?.中文名 || 尾.工具?.名称 || "工具"
  return "正在调用 " + 名 + "…"
}

/** 完成后的摘要：思考 N 字 / M 次工具，两者都有就拼起来。 */
export function 完成标题(条们: 对话条目[]): string {
  let 字数 = 0
  let 工具数 = 0
  for (const 条 of 条们) {
    if (条.思考) 字数 += 条.思考.replace(/\s/g, "").length
    if (条.工具) 工具数 += 1
  }
  const 片: string[] = []
  if (字数 > 0) 片.push("思考 · " + 字数 + " 字")
  if (工具数 > 0) 片.push(工具数 + " 次工具")
  return 片.length > 0 ? 片.join(" · ") : "过程"
}

/** 这张过程卡还在跑吗：最后一个过程条目还在进行中就算运行中。 */
export function 过程进行中(条们: 对话条目[]): boolean {
  const 尾 = 条们[条们.length - 1]
  return Boolean(尾 && (尾.进行中 || 尾.工具?.状态 === "开始"))
}

export function 过程标题(条们: 对话条目[]): string {
  return 过程进行中(条们) ? 进行中标题(条们) : 完成标题(条们)
}

/** 归一化：连续的过程条目合成一张卡，遇到普通消息就断开。 */
export function 归显示项(消息们: 对话条目[]): 显示项[] {
  const 出: 显示项[] = []
  for (const 条 of 消息们) {
    if (!是过程(条)) {
      出.push({ 类型: "消息", 条 })
      continue
    }
    const 尾 = 出[出.length - 1]
    if (尾 && 尾.类型 === "过程") 尾.条们.push(条)
    else 出.push({ 类型: "过程", 条们: [条] })
  }
  return 出
}
