// 只负责一件事：把流式文本按节流渲染成富文本 HTML（复用 编辑器渲染.渲染Markdown）。
// 思路参考 OpenFic（Apache-2.0）：增量拼完整再统一渲染，避免每个 token 都重排；实现为本项目自写。
import { useEffect, useRef, useState } from "react"
import { 渲染Markdown } from "./编辑器渲染"

/** 未闭合的代码围栏先补一行，让半截代码块也能安全渲染。 */
export function 闭合围栏(文本: string): string {
  const 围栏数 = (文本.match(/```/g) ?? []).length
  if (围栏数 % 2 === 1) return 文本 + "\n```"
  return 文本
}

/** 一段 Markdown → 安全 HTML（渲染Markdown 内部会先转义再拼结构）。 */
export function 渲染流式(文本: string): string {
  if (!文本) return ""
  return 渲染Markdown(闭合围栏(文本))
}

/**
 * 流式渲染：默认 80ms 或累计 40 字才重渲染一次；文本变短（重跑/替换）时立刻重渲染。
 */
export function use流式渲染(文本: string, 已完成: boolean): string {
  const [html, setHtml] = useState(() => 渲染流式(文本))
  const 上次 = useRef({ 时间: 0, 长: 0, 原文: "" })
  const 计时 = useRef<number | null>(null)

  useEffect(() => {
    if (文本 === 上次.current.原文) return
    const 现在 = Date.now()
    const 间隔 = 现在 - 上次.current.时间
    const 增量 = 文本.length - 上次.current.长
    const 该刷 = 已完成 || 间隔 >= 80 || 增量 >= 40 || 增量 < 0

    const 刷 = () => {
      if (计时.current !== null) {
        window.clearTimeout(计时.current)
        计时.current = null
      }
      上次.current = { 时间: Date.now(), 长: 文本.length, 原文: 文本 }
      setHtml(渲染流式(文本))
    }

    if (该刷) {
      刷()
      return
    }
    if (计时.current !== null) window.clearTimeout(计时.current)
    计时.current = window.setTimeout(刷, 80)
    return () => {
      if (计时.current !== null) {
        window.clearTimeout(计时.current)
        计时.current = null
      }
    }
  }, [文本, 已完成])

  return html
}
