// 只负责一件事：把伏笔看板与台账分册竖着排进左栏，用统一的分组条起头。
import React from "react"
import type { 看板数据 } from "./接口"
import { 伏笔看板 } from "./伏笔看板"
import { 台账列表 } from "./台账列表"

export function 台账面板(属性: { 看板: 看板数据 | null }) {
  return (
    <div className="左栏分组">
      <div className="分组条">
        <span>伏笔看板</span>
        <span>{属性.看板?.统计.总数 ?? 0} 条</span>
      </div>
      <伏笔看板 看板={属性.看板} />
      <div className="分组条">
        <span>台账分册</span>
        <span>{属性.看板?.台账.length ?? 0} 份</span>
      </div>
      <台账列表 看板={属性.看板} />
    </div>
  )
}
