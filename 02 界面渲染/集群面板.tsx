// 只负责一件事：把智能体集群摊开，并从这里派活。
import React, { useState } from "react"
import type { 集群成员 } from "./接口"
import { 图标 } from "./图标"

export function 集群面板(属性: {
  成员们: 集群成员[]
  章节号: number | null
  忙: boolean
  派活: (任务: string) => void
  新建成员: (名称: string, 职责: string, 管辖: string) => void
  删除成员: (id: string) => void
  改成员: (id: string, 名称: string, 职责: string, 管辖: string) => void
  待裁定数: number
  看待裁定: () => void
}) {
  const [自定义, set自定义] = useState("")
  const [新开, set新开] = useState(false)
  const [名, set名] = useState("")
  const [职, set职] = useState("")
  const [辖, set辖] = useState("")
  const 固定 = 属性.成员们.filter((x) => x.角色 !== "人物")
  const 人物 = 属性.成员们.filter((x) => x.角色 === "人物")
  const 章 = 属性.章节号 ?? 0

  const 快捷 = (任务: string) => () => 属性.派活(任务)

  const 改 = (成员: 集群成员) => {
    const 名 = window.prompt("名称", 成员.名称)
    if (名 === null) return
    const 职 = window.prompt("职责一句话（会成为它的人格）", 成员.人格)
    if (职 === null) return
    const 辖 = window.prompt("管辖文件，逗号分隔", 成员.管辖.join("，"))
    if (辖 === null) return
    属性.改成员(成员.id, 名, 职, 辖)
  }

  const 删 = (成员: 集群成员) => {
    if (window.confirm("从集群里移除「" + 成员.名称 + "」？档案不会动。")) 属性.删除成员(成员.id)
  }

  return (
    <div style={{ padding: "10px 12px 0" }}>
      <div className="统计行">
        <span className="胶囊">
          <图标 名="用户群" 大小={13} /> 成员 {属性.成员们.length}
        </span>
        <span className="胶囊">章节 ch{章}</span>
        {属性.忙 ? <span className="胶囊 警">正在召集…</span> : null}
        <button className="胶囊" onClick={属性.看待裁定} title="看这一章的待裁定建议">
          <图标 名="灯泡" 大小={13} /> {属性.待裁定数} 条待裁定
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        <button disabled={属性.忙} onClick={快捷("准备写第 " + (章 + 1) + " 章：给出本章目标、必须兑现的伏笔、不能写的东西、谁在场。")}>
          <图标 名="播放" 大小={14} />
          准备第 {章 + 1} 章
        </button>
        <button disabled={属性.忙} onClick={快捷("以现有档案为准，列出第 " + 章 + " 章最可能的三处设定矛盾或称呼错误，每条给出处。")}>
          <图标 名="搜索" 大小={14} />
          查一遍矛盾
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <input
          className="搜索框"
          style={{ marginBottom: 0 }}
          placeholder="直接派活，例如：三叶这条线下一章该做什么"
          value={自定义}
          onChange={(事件) => set自定义(事件.target.value)}
          onKeyDown={(事件) => {
            if (事件.key === "Enter" && 自定义.trim()) {
              属性.派活(自定义.trim())
              set自定义("")
            }
          }}
        />
        <button
          disabled={属性.忙 || !自定义.trim()}
          onClick={() => {
            属性.派活(自定义.trim())
            set自定义("")
          }}
        >
          派
        </button>
      </div>

      {属性.忙 ? <div className="微信息" style={{ marginBottom: 10 }}>正在召集… 负责人还在写，答完会自动汇总到右侧对话栏。</div> : null}

      <div className="分组标题" style={{ paddingLeft: 0 }}>固定角色</div>
      {固定.map((成员) => (
        <div key={成员.id} className="成员项">
          <div className="成员头">
            <span className="成员名">{成员.名称}</span>
            <button className="小按钮 图标按钮" onClick={() => 改(成员)} title="改这一位">
              <图标 名="铅笔" 大小={14} />
            </button>
            <button className="小按钮 图标按钮" onClick={() => 删(成员)} title="从集群移除这一位">
              <图标 名="垃圾桶" 大小={14} />
            </button>
            <span className="徽">{成员.角色}</span>
          </div>
          <div className="成员尾">{成员.管辖[0] ?? "—"}</div>
        </div>
      ))}

      <div className="分组标题" style={{ paddingLeft: 0 }}>人物负责人 · {人物.length}</div>
      {人物.map((成员) => (
        <div key={成员.id} className="成员项">
          <div className="成员头">
            <span className="成员名">{成员.名称}</span>
            <button className="小按钮 图标按钮" onClick={() => 改(成员)} title="改这一位">
              <图标 名="铅笔" 大小={14} />
            </button>
            <button className="小按钮 图标按钮" onClick={() => 删(成员)} title="从集群移除这一位">
              <图标 名="垃圾桶" 大小={14} />
            </button>
            <span className="徽">人物</span>
          </div>
          <div className="成员尾">{成员.人格.slice(0, 42)}…</div>
        </div>
      ))}
      {人物.length === 0 ? <div className="空态">还没有从出场追踪里读到人物</div> : null}

      <div style={{ marginTop: 14 }}>
        <button style={{ width: "100%" }} onClick={() => set新开((旧) => !旧)}>
          <图标 名={新开 ? "关闭" : "加号"} 大小={14} />
          {新开 ? "取消新建" : "新建智能体"}
        </button>
        {新开 ? (
          <div style={{ marginTop: 8 }}>
            <input className="搜索框" placeholder="名称，例如：时间线看守" value={名} onChange={(e) => set名(e.target.value)} />
            <input className="搜索框" placeholder="职责一句话，会成为它的人格" value={职} onChange={(e) => set职(e.target.value)} />
            <input
              className="搜索框"
              placeholder="管辖，逗号分隔，例如：台账/时间线.md 或 设定/人物"
              value={辖}
              onChange={(e) => set辖(e.target.value)}
            />
            <button
              disabled={!名.trim()}
              style={{ width: "100%" }}
              onClick={() => {
                属性.新建成员(名.trim(), 职.trim(), 辖.trim())
                set名("")
                set职("")
                set辖("")
                set新开(false)
              }}
            >
              加入集群
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
