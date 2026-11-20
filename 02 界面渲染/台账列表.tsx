// 只负责一件事：列出书库里的台账分册，供一眼点到。
import React from "react"
import type { 看板数据 } from "./接口"

export function 台账列表(属性: { 看板: 看板数据 | null }) {
  const 看板 = 属性.看板
  if (!看板) return <div className="空态">尚未读取台账</div>
  if (看板.台账.length === 0) return <div className="空态">这个书库里还没有「台账」目录</div>

  return (
    <div>
      {看板.台账.map((卡) => (
        <div key={卡.相对路径} className="伏笔项">
          <div className="伏笔头">
            <span className="伏笔名">{卡.名称}</span>
            <span className="徽">{卡.行数} 行</span>
          </div>
          <div className="伏笔尾">{卡.摘录}</div>
        </div>
      ))}
    </div>
  )
}
