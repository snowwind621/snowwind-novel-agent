// 只负责一件事：把书库目录树画成可折叠的列表（只管展开与点击，不读盘）。
import React, { useState } from "react"
import type { 文件节点 } from "./接口"
import { 图标 } from "./图标"

function 大小字(字节: number): string {
  if (字节 < 1024) return 字节 + " B"
  return (字节 / 1024).toFixed(字节 < 10240 ? 1 : 0) + " KB"
}

export function 文件树(属性: {
  节点们: 文件节点[]
  当前: string | null
  打开: (相对路径: string) => void
}) {
  const [展开, set展开] = useState<Record<string, boolean>>({})

  const 切 = (相对路径: string) => set展开((旧) => ({ ...旧, [相对路径]: !旧[相对路径] }))

  const 画 = (节点: 文件节点, 深: number): React.ReactNode => {
    const 缩进 = { paddingLeft: 10 + 深 * 14 }
    if (节点.是目录) {
      const 开着 = Boolean(展开[节点.相对路径])
      return (
        <div key={节点.相对路径}>
          <div className="树行 树目录" style={缩进} onClick={() => 切(节点.相对路径)} title={节点.相对路径}>
            <图标 名="箭头下" 大小={14} 类名={开着 ? "" : "折右"} />
            <图标 名={开着 ? "文件夹打开" : "文件夹"} 大小={15} />
            <span className="树名">{节点.名称}</span>
            <span className="树数">{节点.子?.length ?? 0}</span>
          </div>
          {开着 ? (节点.子 ?? []).map((子) => 画(子, 深 + 1)) : null}
        </div>
      )
    }
    return (
      <div
        key={节点.相对路径}
        className={"树行 树文件" + (节点.相对路径 === 属性.当前 ? " 选中" : "")}
        style={缩进}
        onClick={() => 属性.打开(节点.相对路径)}
        title={节点.相对路径}
      >
        <图标 名="书本" 大小={15} />
        <span className="树名">{节点.名称}</span>
        <span className="树数">{大小字(节点.大小)}</span>
      </div>
    )
  }

  if (属性.节点们.length === 0) return <div className="空态">这本书里还没有文件</div>
  return <div className="树">{属性.节点们.map((节点) => 画(节点, 0))}</div>
}