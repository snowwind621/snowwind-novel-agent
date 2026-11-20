// 只负责一件事：显示并编辑一章正文。
import React from "react"
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
  状态字: string
}) {
  const { 已开书库, 编号, 标题, 正文, 脏, 改, 保存, 同步台账, 续写, 停止续写, 续写中, 状态字 } = 属性

  if (编号 === null) {
    return (
      <div className="中栏">
        <div className="空态">
          {已开书库 ? "已完成装载。" : "还没有打开书库。"}
          <br />
          {已开书库 ? "在左边点一章开始写。" : "点右上角「打开书库」，选择一本书的根目录（含 project.yaml 的那层）。"}
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
          <span>{状态字}</span>
          <button onClick={保存} disabled={!脏}>
            保存并提交
          </button>
          <button onClick={同步台账}>同步台账</button>
          <button onClick={续写} disabled={续写中}>
            {续写中 ? "续写中…" : "AI 续写"}
          </button>
          {续写中 ? <button onClick={停止续写}>停止</button> : null}
        </div>
      </div>
      <textarea
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
