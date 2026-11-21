// 只负责一件事：判断对话历史该不该压、怎么压、压完怎么拼成这一段提问（纯函数，界面与主进程都能用）。

/** 界面上一条消息的最小形状；只认文本，不关心 UI 字段。 */
export interface 对话条 { 谁: string; 文本: string }

/** 设置里跟摘要有关的那两小块；只收会用到的字段，别的地方传什么形状都能进来。 */
export interface 摘要设置来源 {
  上下文?: { 摘要模型?: string }
  模型?: { 分工?: { 助手?: string } }
}

/**
 * 摘要用哪个模型：设置里填了就用它，留空回落到「助手」分工。
 * 摘要模型填错也不至于让对话压不了——调用方拿到的永远是能用的模型名。
 */
export function 取摘要模型(设置: 摘要设置来源 | null | undefined, 兜底 = ""): string {
  const 指定 = String(设置?.上下文?.摘要模型 ?? "").trim()
  if (指定) return 指定
  const 助手 = String(设置?.模型?.分工?.助手 ?? "").trim()
  return 助手 || 兜底
}

export interface 压缩配置 {
  历史保留条数: number
  /** 0.3 ~ 1：估算用量到这个比例就开始压 */
  压缩触发比例: number
  压缩后保留条数: number
}

/** 每条保留消息按这么多 token 粗估预算；够用就行，注释里写明白是估算。 */
const 每条预算词元 = 80
/** 中文大致 1.5 字 / token（含标点与英文混排的粗估），只用来看趋势，不拿它算钱。 */
const 每词元字数 = 1.5

export function 估算词元(文本: string): number {
  return Math.max(0, Math.ceil(String(文本 ?? "").length / 每词元字数))
}

/**
 * 要不要压：
 * 1) 条数没超过「历史保留条数」就不压；
 * 2) 条数超了，再看估算用量有没有到「压缩触发比例」× 预算，没到就再等等；
 * 3) 条数超过保留条数两倍时不再等（硬上限），直接压。
 */
export function 该压缩(条数: number, 估算: number, 配置: 压缩配置): boolean {
  const 保留 = Math.max(1, Math.round(配置.历史保留条数))
  if (条数 <= 保留) return false
  const 预算 = 保留 * 每条预算词元
  const 比例 = Math.min(1, Math.max(0.1, 配置.压缩触发比例 || 1))
  return 估算 >= 预算 * 比例 || 条数 >= 保留 * 2
}

/** 留最后 N 条原文，前面的进摘要。 */
export function 取要压的<T>(历史: T[], 压缩后保留条数: number): { 要压: T[]; 保留: T[] } {
  const 留 = Math.max(0, Math.round(压缩后保留条数))
  if (留 === 0) return { 要压: [...历史], 保留: [] }
  if (历史.length <= 留) return { 要压: [], 保留: [...历史] }
  return { 要压: 历史.slice(0, 历史.length - 留), 保留: 历史.slice(历史.length - 留) }
}

/** 摘要请求：温度 0、只许写事实，输出 200 字以内。 */
export function 造摘要提示(要压: 对话条[]): { 系统提示: string; 用户输入: string } {
  return {
    系统提示: [
      "你是对话摘要助手。把下面这段较早的对话压成一段中文摘要，200 字以内。",
      "只保留三类事实：作者提过什么要求、已经定下的结论、还没解决的问题。",
      "不要评价，不要复述原话，不要编造对话里没出现的东西；没有可写的就写「（无）」并以它结尾。",
    ].join("\n"),
    用户输入: 要压.map((条) => "[" + 条.谁 + "] " + 条.文本.trim()).join("\n\n"),
  }
}

/** 拼这一次真正发出去的输入：旧摘要 + 保留的原文 + 本次问题。 */
export function 拼用户输入(摘要: string, 保留: 对话条[], 新问题: string): string {
  const 段: string[] = []
  const 干净摘要 = String(摘要 ?? "").trim()
  if (干净摘要) 段.push("【较早对话摘要】", 干净摘要, "")
  if (保留.length > 0) {
    段.push("【最近 " + 保留.length + " 条对话】")
    for (const 条 of 保留) 段.push("[" + 条.谁 + "] " + 条.文本.trim())
    段.push("")
  }
  段.push("【本次问题】", String(新问题 ?? "").trim())
  return 段.join("\n")
}

/** 旧摘要 + 新摘要，太长了就只留后半段（摘要本身不该无限膨胀）。 */
export function 续摘要(旧摘要: string, 新摘要: string, 上限 = 800): string {
  const 合 = [String(旧摘要 ?? "").trim(), String(新摘要 ?? "").trim()].filter(Boolean).join("\n")
  if (合.length <= 上限) return 合
  return 合.slice(合.length - 上限)
}
