// 只负责一件事：显示并编辑一章正文，顺手把选区报给对话栏（改写要用）。
import React, { useRef } from "react"
import { 计字数 } from "./接口"

export function 正文编辑(属性: {
  已开书库: boolean
  编号: number | null
  标题: string
  正文: string
  脏: boolean
  改: (正文: string) => void
  保存: () => void
  报选区: (起: number, 止: number) => void
  状态字: string
}) {
  const { 已开书库, 编号, 标题, 正文, 脏, 改, 保存, 报选区, 状态字 } = 属性
  const 框 = useRef<HTMLTextAreaElement | null>(null)

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

  return (
    <div className="中栏">
      <div className="编辑器头">
        <strong>{"ch" + 编号 + "　" + 标题}</strong>
        <span>{计字数(正文)} 字</span>
        <div className="右">
          <span>{脏 ? "● 未保存" : "已保存"}</span>
          <button onClick={保存} disabled={!脏}>
            保存并提交
          </button>
          <span>{状态字}</span>
        </div>
      </div>
      <textarea
        ref={框}
        className="正文"
        value={正文}
        spellCheck={false}
        onChange={(事件) => 改(事件.target.value)}
        onSelect={(事件) => {
          const 元素 = 事件.currentTarget
          报选区(元素.selectionStart ?? 0, 元素.selectionEnd ?? 0)
        }}
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