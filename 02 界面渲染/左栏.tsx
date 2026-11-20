// 只负责一件事：左栏外壳，在「章节 / 台账 / 集群」之间切换。
import React, { useState } from "react"
import type { 项目摘要, 看板数据, 集群成员 } from "./接口"
import { 章节树 } from "./章节树"
import { 台账面板 } from "./台账面板"
import { 集群面板 } from "./集群面板"

type 左页 = "章节" | "台账" | "集群"

export function 左栏(属性: {
  项目: 项目摘要 | null
  当前章: number | null
  选章: (编号: number) => void
  看板: 看板数据 | null
  成员们: 集群成员[]
  派活中: boolean
  派活: (任务: string) => void
  新建成员: (名称: string, 职责: string, 管辖: string) => void
  删除成员: (id: string) => void
  改成员: (id: string, 名称: string, 职责: string, 管辖: string) => void
}) {
  const 链接页 = new URLSearchParams(location.search).get("页")
  const 初始: 左页 = 链接页 === "台账" ? "台账" : 链接页 === "集群" ? "集群" : "章节"
  const [页, set页] = useState<左页>(初始)

  return (
    <div className="左栏">
      <div className="分段">
        {(["章节", "台账", "集群"] as 左页[]).map((名) => (
          <button key={名} className={"分段按钮" + (页 === 名 ? " 选中" : "")} onClick={() => set页(名)}>
            {名}
            {名 === "台账" && 属性.看板?.统计.超期 ? " · " + 属性.看板.统计.超期 : ""}
            {名 === "集群" && 属性.派活中 ? " ·…" : ""}
          </button>
        ))}
      </div>
      <div className="左栏体">
        {页 === "章节" ? (
          属性.项目 ? (
            <章节树 项目={属性.项目} 当前章={属性.当前章} 选章={属性.选章} />
          ) : (
            <div className="空态">还没有打开书库</div>
          )
        ) : null}
        {页 === "台账" ? <台账面板 看板={属性.看板} /> : null}
        {页 === "集群" ? (
          <集群面板
            成员们={属性.成员们}
            章节号={属性.当前章}
            忙={属性.派活中}
            派活={属性.派活}
            新建成员={属性.新建成员}
            删除成员={属性.删除成员}
            改成员={属性.改成员}
          />
        ) : null}
      </div>
    </div>
  )
}
