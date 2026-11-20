// 只负责一件事：把书库目录树画成带指示线的可折叠列表（只管展开与点击，不读盘）。
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

  /**
   * 祖先末项：每进一层记下「父级是不是同级最后一个」——是的话那条竖线就断掉，
   * 这样最后一项的指示线会折角收尾，而不是一路拖到底。
   */
  const 画 = (节点: 文件节点, 深: number, 祖先末项: boolean[], 是末项: boolean, 分隔: boolean): React.ReactNode => {
    const 开着 = Boolean(展开[节点.相对路径])
    const 行类 =
      "列表行 树行" +
      (节点.是目录 ? " 树目录" : " 树文件") +
      (节点.相对路径 === 属性.当前 ? " 选中" : "") +
      (分隔 ? " 分组首行" : "")
    const 导线们 = 祖先末项.map((断, 位) => <span key={位} className={"树导线" + (断 ? " 断" : "")} />)
    const 接头 = <span className={"树接头" + (是末项 ? " 末" : "")} />

    if (节点.是目录) {
      return (
        <div key={节点.相对路径}>
          <div className={行类} onClick={() => 切(节点.相对路径)} title={节点.相对路径}>
            {导线们}
            {深 > 0 ? 接头 : null}
            <图标 名="箭头下" 大小={14} 类名={"树箭头" + (开着 ? "" : " 折右")} />
            <图标 名={开着 ? "文件夹打开" : "文件夹"} 大小={15} />
            <span className="树名">{节点.名称}</span>
            <span className="树数">{节点.子?.length ?? 0}</span>
          </div>
          {开着 ? 画一组(节点.子 ?? [], 深 + 1, [...祖先末项, 是末项]) : null}
        </div>
      )
    }

    return (
      <div key={节点.相对路径} className={行类} onClick={() => 属性.打开(节点.相对路径)} title={节点.相对路径}>
        {导线们}
        {深 > 0 ? 接头 : null}
        <图标 名="书本" 大小={15} />
        <span className="树名">{节点.名称}</span>
        <span className="树数">{大小字(节点.大小)}</span>
      </div>
    )
  }

  /** 同级里：顶层每一项之间加分割线；子级里「目录块 ↔ 文件块」交界处加分割线。 */
  const 画一组 = (节点们: 文件节点[], 深: number, 祖先末项: boolean[]): React.ReactNode =>
    节点们.map((节点, 序) => {
      const 前一 = 节点们[序 - 1]
      const 分隔 = 序 > 0 && (深 === 0 || 前一.是目录 !== 节点.是目录)
      return 画(节点, 深, 祖先末项, 序 === 节点们.length - 1, 分隔)
    })

  if (属性.节点们.length === 0) return <div className="空态">这本书里还没有文件</div>
  return <div className="树">{画一组(属性.节点们, 0, [])}</div>
}
