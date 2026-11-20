// 只负责一件事：跟 OpenAI 兼容网关说话（取模型清单、流式收字、收用量，带超时与可重试）。

import type { 用量 } from "../03 进程桥接/通道"

/** 一次调用的策略：全部可选，调用方没给就用这里的兜底值。 */
export interface 调用策略 {
  /** 单次请求的硬超时（秒）；到点就中断，并按「重试次数」决定要不要再来一次 */
  超时秒?: number
  重试次数?: number
  重试间隔秒?: number
  温度?: number
  最大词元?: number
}

export interface 流式参数 extends 调用策略 {
  基址: string
  密钥: string
  模型: string
  消息: Array<{ role: "system" | "user" | "assistant"; content: string }>
  信号?: AbortSignal
  /** 「用量」的文本是一段 JSON（用量 结构），上层原样往下传即可 */
  回调: (类型: "思考" | "正文" | "用量", 文本: string) => void
}

export const 策略兜底 = { 超时秒: 120, 重试次数: 0, 重试间隔秒: 0, 温度: 0.9, 最大词元: 4096 }

/** 把设置里的「模型」组翻成调用策略；调用方 spread 进参数即可，显式传的字段优先。 */
export function 取调用策略(模型: {
  超时秒?: number
  重试次数?: number
  重试间隔秒?: number
  温度?: number
  最大输出词元?: number
}): 调用策略 {
  return {
    超时秒: 模型.超时秒,
    重试次数: 模型.重试次数,
    重试间隔秒: 模型.重试间隔秒,
    温度: 模型.温度,
    最大词元: 模型.最大输出词元,
  }
}

const 数 = (值: unknown): number => {
  const 转 = Number(值)
  return Number.isFinite(转) ? 转 : 0
}

/** 各家网关写法不同，揉成一份：命中优先 prompt_cache_hit_tokens，其次 prompt_tokens_details.cached_tokens。 */
function 规范用量(原始: any): 用量 {
  const 输入 = 数(原始?.prompt_tokens)
  const 输出 = 数(原始?.completion_tokens)
  const 总计 = 数(原始?.total_tokens) || 输入 + 输出
  const 明细命中 = 原始?.prompt_tokens_details?.cached_tokens
  const 命中 =
    原始?.prompt_cache_hit_tokens !== undefined ? 数(原始.prompt_cache_hit_tokens) : 明细命中 !== undefined ? 数(明细命中) : null
  const 未命中 =
    原始?.prompt_cache_miss_tokens !== undefined
      ? 数(原始.prompt_cache_miss_tokens)
      : 命中 !== null && 输入 >= 命中
        ? 输入 - 命中
        : null
  return { 输入, 输出, 总计, 缓存命中: 命中, 缓存未命中: 未命中 }
}

function 等(毫秒: number): Promise<void> {
  return new Promise((解决) => setTimeout(解决, Math.max(0, 毫秒)))
}

/** 只把「5xx」当可重试；400/422 是请求格式问题，重试也不会好。 */
function 可重试状态(状态: number): boolean {
  return 状态 >= 500 && 状态 <= 599
}

interface 一次尝试 {
  信号: AbortSignal
  超时了: () => boolean
  收尾: () => void
}

/** 把「用户信号」和「超时」合成一个信号，并记住这次是不是超时——超时要重试，用户手动中止不重试。 */
function 组一次尝试(超时秒: number, 外部?: AbortSignal): 一次尝试 {
  const 控制器 = new AbortController()
  let 超时 = false
  const 毫秒 = Math.max(1, 超时秒) * 1000
  const 定时 = setTimeout(() => {
    超时 = true
    控制器.abort()
  }, 毫秒)
  const 转发 = () => 控制器.abort()
  if (外部) {
    if (外部.aborted) 控制器.abort()
    else 外部.addEventListener("abort", 转发, { once: true })
  }
  return {
    信号: 控制器.signal,
    超时了: () => 超时,
    收尾: () => {
      clearTimeout(定时)
      外部?.removeEventListener("abort", 转发)
    },
  }
}

export async function 拉模型清单(基址: string, 密钥: string, 超时秒 = 策略兜底.超时秒): Promise<string[]> {
  const 响应 = await fetch(基址.replace(/\/$/, "") + "/models", {
    headers: { Authorization: "Bearer " + 密钥 },
    signal: AbortSignal.timeout(Math.max(1, 超时秒) * 1000),
  })
  if (!响应.ok) throw new Error("取模型清单失败：" + 响应.status)
  const 数据 = await 响应.json()
  const 列表 = Array.isArray(数据?.data) ? 数据.data : []
  return 列表.map((项: any) => String(项?.id ?? "")).filter(Boolean)
}

function 请求体(参数: 流式参数, 带用量: boolean): string {
  return JSON.stringify({
    model: 参数.模型,
    messages: 参数.消息,
    stream: true,
    ...(带用量 ? { stream_options: { include_usage: true } } : {}),
    temperature: 参数.温度 ?? 策略兜底.温度,
    max_tokens: 参数.最大词元 ?? 策略兜底.最大词元,
  })
}

/** 发一次；超时/连接失败/5xx 由外层决定要不要重试。 */
async function 发一次(参数: 流式参数, 带用量: boolean, 尝试: 一次尝试): Promise<Response> {
  return fetch(参数.基址.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + 参数.密钥 },
    body: 请求体(参数, 带用量),
    signal: 尝试.信号,
  })
}

/**
 * 带重试地拿到一个可用响应。
 * 只重试「超时 / 连接失败 / 5xx」；用户自己按了停止（外部信号）立刻放弃。
 * 已经吐字之后不再重试——那在 流式对话 的读流阶段，不经过这里。
 */
async function 发请求(参数: 流式参数, 带用量: boolean): Promise<Response> {
  const 重试次数 = Math.max(0, Math.floor(参数.重试次数 ?? 策略兜底.重试次数))
  const 超时秒 = 参数.超时秒 ?? 策略兜底.超时秒
  const 间隔 = Math.max(0, 参数.重试间隔秒 ?? 策略兜底.重试间隔秒) * 1000
  let 最后错误: any = null
  for (let 轮 = 0; 轮 <= 重试次数; 轮++) {
    const 尝试 = 组一次尝试(超时秒, 参数.信号)
    try {
      const 响应 = await 发一次(参数, 带用量, 尝试)
      if (响应.ok || !可重试状态(响应.status)) return 响应
      最后错误 = new Error("网关返回 " + 响应.status)
    } catch (错误: any) {
      if (参数.信号?.aborted) throw 错误
      if (尝试.超时了()) 最后错误 = new Error("网关超时（" + 超时秒 + " 秒）")
      else 最后错误 = 错误
    } finally {
      尝试.收尾()
    }
    if (轮 < 重试次数) await 等(间隔)
  }
  throw 最后错误 ?? new Error("网关请求失败")
}

export async function 流式对话(参数: 流式参数): Promise<string> {
  // 有的网关不认 stream_options 会直接 400/422：退一步不带它重发一次，拿不到用量就当没有，不报错。
  let 响应 = await 发请求(参数, true)
  if (响应.status === 400 || 响应.status === 422) 响应 = await 发请求(参数, false)
  if (!响应.ok || !响应.body) {
    const 详情 = await 响应.text().catch(() => "")
    throw new Error("网关返回 " + 响应.status + " " + 详情.slice(0, 200))
  }

  const 阅读器 = 响应.body.getReader()
  const 解码器 = new TextDecoder()
  let 缓冲 = ""
  let 全文 = ""
  let 已报用量 = false

  for (;;) {
    const { value, done } = await 阅读器.read()
    if (done) break
    缓冲 += 解码器.decode(value, { stream: true })
    const 行们 = 缓冲.split("\n")
    缓冲 = 行们.pop() ?? ""
    for (const 行 of 行们) {
      const 修剪 = 行.trim()
      if (!修剪.startsWith("data:")) continue
      const 数据 = 修剪.slice(5).trim()
      if (!数据 || 数据 === "[DONE]") continue
      try {
        const 片段 = JSON.parse(数据)
          // 用量块常常是最后一块，而且这一块的 choices 是空数组——不能因为取不到 delta 就跳过。
          if (片段?.usage && !已报用量) {
            已报用量 = true
            参数.回调("用量", JSON.stringify(规范用量(片段.usage)))
          }
          const 增量 = 片段?.choices?.[0]?.delta ?? {}
          if (增量.reasoning_content) 参数.回调("思考", String(增量.reasoning_content))
          if (增量.content) {
            全文 += String(增量.content)
          参数.回调("正文", String(增量.content))
        }
      } catch {
        /* 心跳行与不完整分片直接跳过 */
      }
    }
  }
  return 全文
}
