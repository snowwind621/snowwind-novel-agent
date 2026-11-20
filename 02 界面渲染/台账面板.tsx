// 只负责一件事：把伏笔看板与台账分册竖着排进左栏。
import React from "react"
import type { 看板数据 } from "./接口"
import { 伏笔看板 } from "./伏笔看板"
import { 台账列表 } from "./台账列表"

export function 台账面板(属性: { 看板: 看板数据 | null }) {
  return (
    <div style={{ padding: "10px 12px 0" }}>
      <伏笔看板 看板={属性.看板} />
      <div className="分组标题" style={{ paddingLeft: 0 }}>
        台账分册 · {属性.看板?.台账.length ?? 0}
      </div>
      <台账列表 看板={属性.看板} />
    </div>
  )
}
