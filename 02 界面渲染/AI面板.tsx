// 只负责一件事：右侧对话栏——消息列表、流式收字、停止打断。
import React, { useEffect, useRef, useState } from "react"
import { 桥 } from "./接口"
import type { 项目摘要, 看板数据, 设置, 对话事件, 对话条目 } from "./接口"
import { 组装系统提示 } from "../05 编排内核/章节提示词"

export function AI面板(属性: {
  消息们: 对话条目[]
  追加: (条: 对话条目) => void
  改条: (id: string, 补: string) => void
  完成: (id: string) => void
  项目: 项目摘要 | null
  章节号: number | null
  标题: string
  正文: string
  设定: 设置 | null
  看板: 看板数据 | null
  追加正文: (文本: string) => void
}) {
  const { 消息们, 追加, 改条, 完成, 项目, 章节号, 标题, 正文, 设定, 看板, 追加正文 } = 属性
  const [模型, set模型] = useState(设定?.分工.助手 ?? "cnwrokbuddy-ds")
  const [输入, set输入] = useState("")
  const [忙, set忙] = useState(false)
  const [错误, set错误] = useState("")
  const 当前请求 = useRef("")
  const 底 = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (设定?.分工.助手) set模型(设定.分工.助手)
  }, [设定])

  useEffect(() => {
    底.current?.scrollTo({ top: 底.current.scrollHeight, behavior: "smooth" })
  }, [消息们])

  useEffect(() => {
    const 卸载 = 桥.监听对话((事件: 对话事件) => {
      if (事件.请求号 !== 当前请求.current) return
      const 回条 = 事件.请求号 + "-回"
      if (事件.类型 === "正文") 改条(回条, 事件.文本)
      else if (事件.类型 === "结束") {
        完成(回条)
        set忙(false)
      } else if (事件.类型 === "错误") {
        改条(回条, "\n[出错] " + 事件.文本)
        完成(回条)
        set错误(事件.文本)
        set忙(false)
      }
    })
    return 卸载
  }, [])

  const 发送 = async () => {
    if (!输入.trim() || 忙) return
    const 请求号 = String(Date.now()) + Math.random().toString(16).slice(2)
    当前请求.current = 请求号
    追加({ id: 请求号 + "-我", 谁: "你", 文本: 输入 })
    追加({ id: 请求号 + "-回", 谁: "总编", 文本: "", 进行中: true })
    set忙(true)
    set错误("")
    const 系统提示 = 组装系统提示({
      书名: 项目?.书名 ?? "未命名作品",
      章节号: 章节号 ?? 0,
      章节标题: 标题 || "创作讨论",
      伏笔: 看板?.伏笔 ?? [],
      正文尾部: 正文,
    })
    await 桥.发送对话({ 请求号, 模型, 系统提示, 用户输入: 输入 })
    set输入("")
  }

  const 停止 = async () => {
    if (!当前请求.current) return
    await 桥.中止对话(当前请求.current)
    set忙(false)
  }

  return (
    <div className="对话区">
      <div className="统计行">
        <span className="胶囊">{模型}</span>
        <span className="胶囊">{章节号 ? "ch" + 章节号 + " 上下文" : "无章节上下文"}</span>
      </div>

      <div className="流" ref={底}>
        {消息们.length === 0 ? (
          <div className="空态" style={{ padding: 24 }}>
            在左边点「集群」，派一件活试试；
            <br />
            或者直接在这里问。
          </div>
        ) : null}
        {消息们.map((条) => (
          <div key={条.id} className={"消息 谁-" + 条.谁}>
            <div className="消息头">
              <span>{条.谁}</span>
              {条.进行中 ? <span className="微信息">正在生成…</span> : null}
            </div>
            <div className="消息体">{条.文本}</div>
            {条.谁 === "总编" && !条.进行中 && 条.文本.trim() ? (
              <div style={{ marginTop: 6 }}>
                <button onClick={() => 追加正文(条.文本)}>插入正文末尾</button>
              </div>
            ) : null}
            {条.明细 ? (
              <details className="明细">
                <summary>各位负责人的原始回答 · {条.明细.length}</summary>
                {条.明细.map((项, 序) => (
                  <div className="明细项" key={序}>
                    <b>
                      {项.成员}（{项.角色}）
                    </b>
                    <div>{项.产出}</div>
                  </div>
                ))}
              </details>
            ) : null}
          </div>
        ))}
      </div>

      <div className="输入行">
        <textarea
          className="输入框"
          placeholder="问总编，或让它派活。Ctrl+Enter 发送。"
          value={输入}
          onChange={(事件) => set输入(事件.target.value)}
          onKeyDown={(事件) => {
            if ((事件.ctrlKey || 事件.metaKey) && 事件.key === "Enter") {
              事件.preventDefault()
              发送()
            }
          }}
        />
        <div>
          <button onClick={发送} disabled={忙 || !输入.trim()}>
            发送
          </button>
          <button onClick={停止} disabled={!忙}>
            停止
          </button>
        </div>
      </div>
      {错误 ? <div className="微信息" style={{ color: "var(--危)" }}>出错：{错误}</div> : null}
    </div>
  )
}
