// 只负责一件事：把书内一个文件摆到中栏——文本能改能存，其它只读看大小。
import React, { useEffect, useRef, useState } from "react"
import type { 文件内容 } from "./接口"

function 大小字(字节: number): string {
  if (字节 < 1024) return 字节 + " B"
  if (字节 < 1024 * 1024) return (字节 / 1024).toFixed(1) + " KB"
  return (字节 / 1024 / 1024).toFixed(1) + " MB"
}

export function 文件视图(属性: {
  内容: 文件内容
  保存: (相对路径: string, 文本: string) => Promise<string>
  关闭: () => void
}) {
  const [草稿, set草稿] = useState(属性.内容.文本)
  const [脏, set脏] = useState(false)
  const [状态字, set状态字] = useState("")
  const 存着呢 = useRef(false)

  useEffect(() => {
    set草稿(属性.内容.文本)
    set脏(false)
    set状态字("")
  }, [属性.内容.相对路径, 属性.内容.大小])

  const 存 = async () => {
    if (存着呢.current) return
    存着呢.current = true
    set状态字("正在保存…")
    try {
      const 说明 = await 属性.保存(属性.内容.相对路径, 草稿)
      set脏(false)
      set状态字(说明)
    } catch (错误: any) {
      set状态字("保存失败：" + String(错误?.message ?? 错误))
    } finally {
      存着呢.current = false
    }
  }

  const 头 = (
    <div className="编辑器头">
      <strong>{属性.内容.相对路径}</strong>
      <span>{属性.内容.是文本 ? 草稿.replace(/\s/g, "").length + " 字" : 大小字(属性.内容.大小)}</span>
      <div className="右">
        {属性.内容.是文本 ? <span>{脏 ? "● 未保存" : "已保存"}</span> : null}
        {属性.内容.是文本 ? (
          <button onClick={存} disabled={!脏}>
            保存并提交
          </button>
        ) : null}
        <button onClick={属性.关闭}>回到正文</button>
        <span>{状态字}</span>
      </div>
    </div>
  )

  if (!属性.内容.是文本) {
    return (
      <div className="中栏">
        {头}
        <div className="空态">
          不支持预览：{大小字(属性.内容.大小)}
          <br />
          这类文件（图片、二进制……）交给系统程序打开。
        </div>
      </div>
    )
  }

  return (
    <div className="中栏">
      {头}
      <textarea
        className="正文 文件正文"
        value={草稿}
        spellCheck={false}
        onChange={(事件) => {
          set草稿(事件.target.value)
          set脏(true)
        }}
        onKeyDown={(事件) => {
          if ((事件.ctrlKey || 事件.metaKey) && 事件.key.toLowerCase() === "s") {
            事件.preventDefault()
            void 存()
          }
        }}
      />
    </div>
  )
}