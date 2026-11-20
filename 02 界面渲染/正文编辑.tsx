// 只负责一件事：显示并编辑一章正文，并把选中的文字交给改写。
import React, { useRef, useState } from "react"
import { 计字数 } from "./接口"

export function 正文编辑(属性: {
  已开书库: boolean
  编号: number | null
  标题: string
  正文: string
  脏: boolean
  改: (正文: string) => void
  保存: () => void
  同步台账: () => void
  续写: () => void
  停止续写: () => void
  续写中: boolean
  改写: (参数: { 原文: string; 起点: number; 终点: number; 指令: string }) => void
  改写中: boolean
  状态字: string
}) {
  const { 已开书库, 编号, 标题, 正文, 脏, 改, 保存, 同步台账, 续写, 停止续写, 续写中, 改写, 改写中, 状态字 } = 属性
  const 框 = useRef<HTMLTextAreaElement | null>(null)
  const [指令, set指令] = useState("")

  if (编号 === null) {
    return (
      <div className="中栏">
        <div className="空态">
          {已开书库 ? "已完成装载。" : "还没有打开书库。"}
          <br />
          {已开书库 ? "在左边点一章开始写。" : "点右上角「打开书库」，选一本「雪风卷宗」的根目录（含 书卷.yaml 的那层）。"}
        </div>
      </div>
    )
  }

  const 取选区 = () => {
    const 元素 = 框.current
    if (!元素) return null
    const 起 = 元素.selectionStart ?? 0
    const 止 = 元素.selectionEnd ?? 0
    if (止 > 起) return { 原文: 正文.slice(起, 止), 起点: 起, 终点: 止 }
    // 没选就当整段：向前后找到最近的空行
    const 前 = 正文.lastIndexOf("\n", 起 - 1)
    const 后 = 正文.indexOf("\n", 止)
    const 段起 = 前 < 0 ? 0 : 前 + 1
    const 段止 = 后 < 0 ? 正文.length : 后
    const 段 = 正文.slice(段起, 段止)
    return 段.trim() ? { 原文: 段, 起点: 段起, 终点: 段止 } : null
  }

  const 发起改写 = () => {
    const 选区 = 取选区()
    if (!选区) {
      window.alert("先把要改的段落选中，或者把光标放在某一段里。")
      return
    }
    改写({ ...选区, 指令: 指令.trim() })
  }

  return (
    <div className="中栏">
      <div className="编辑器头">
        <strong>{"ch" + 编号 + "　" + 标题}</strong>
        <span>{计字数(正文)} 字</span>
        <div className="右">
          <input
            className="改写框"
            placeholder="改写要求，如：更冷一点、删掉解释"
            value={指令}
            onChange={(事件) => set指令(事件.target.value)}
            onKeyDown={(事件) => {
              if (事件.key === "Enter") {
                事件.preventDefault()
                发起改写()
              }
            }}
          />
          <button onClick={发起改写} disabled={改写中}>
            {改写中 ? "改写中…" : "改写选中"}
          </button>
          <span>{脏 ? "● 未保存" : "已保存"}</span>
          <button onClick={保存} disabled={!脏}>
            保存并提交
          </button>
          <button onClick={同步台账}>同步台账</button>
          <button onClick={续写} disabled={续写中}>
            {续写中 ? "续写中…" : "AI 续写"}
          </button>
          {续写中 ? <button onClick={停止续写}>停止</button> : null}
          <span>{状态字}</span>
        </div>
      </div>
      <textarea
        ref={框}
        className="正文"
        value={正文}
        spellCheck={false}
        onChange={(事件) => 改(事件.target.value)}
        onKeyDown={(事件) => {
          if ((事件.ctrlKey || 事件.metaKey) && 事件.key.toLowerCase() === "s") {
            事件.preventDefault()
            保存()
          }
        }}
      />
    </div>
  )
}
