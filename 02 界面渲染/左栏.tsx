// 只负责一件事：左栏外壳，在「章节 / 文件 / 台账 / 建议」之间切换。
import React, { useEffect, useState } from "react"
import type { 项目摘要, 看板数据, 待裁定章, 文件节点 } from "./接口"
import { 桥 } from "./接口"
import { 章节树 } from "./章节树"
import { 台账面板 } from "./台账面板"
import { 文件树 } from "./文件树"

export type 左页 = "章节" | "文件" | "台账" | "建议"

export function 左栏(属性: {
  项目: 项目摘要 | null
  当前章: number | null
  选章: (编号: number) => void
  看板: 看板数据 | null
  待裁定: 待裁定章[]
  页: 左页
  切页: (页: 左页) => void
  当前文件: string | null
  打开文件: (相对路径: string) => void
}) {
  const [树, set树] = useState<文件节点[]>([])
  const [树状态, set树状态] = useState("")
  const [拉树号, set拉树号] = useState(0)
  const 章 = 属性.当前章 ?? 0
  const 本章条目 = 属性.待裁定.find((项) => 项.章号 === 章)?.条目 ?? []

  // 只在切到「文件」页或换书时拉一次树：书库文件不会自己变，刷新按钮留给手动。
  useEffect(() => {
    if (属性.页 !== "文件" || !属性.项目) return
    let 还有效 = true
    void (async () => {
      try {
        const 结果 = await 桥.书库文件树()
        if (!还有效) return
        set树(结果.树)
        set树状态(结果.截断 ? "条目超过 2000，只列了一部分" : "")
      } catch (错误: any) {
        if (!还有效) return
        set树([])
        set树状态("读不到文件树：" + String(错误?.message ?? 错误))
      }
    })()
    return () => {
      还有效 = false
    }
  }, [属性.页, 属性.项目?.路径, 拉树号])

  return (
    <div className="左栏">
      <div className="分段">
        {(["章节", "文件", "台账", "建议"] as 左页[]).map((名) => (
          <button key={名} className={"分段按钮" + (属性.页 === 名 ? " 选中" : "")} onClick={() => 属性.切页(名)}>
            {名}
            {名 === "台账" && 属性.看板?.统计.超期 ? " · " + 属性.看板.统计.超期 : ""}
            {名 === "文件" && 属性.当前文件 ? " ●" : ""}
            {名 === "建议" && 本章条目.length ? " · " + 本章条目.length : ""}
          </button>
        ))}
      </div>
      <div className="左栏体">
        {属性.页 === "章节" ? (
          属性.项目 ? (
            <章节树 项目={属性.项目} 当前章={属性.当前章} 选章={属性.选章} />
          ) : (
            <div className="空态">还没有打开书库</div>
          )
        ) : null}
        {属性.页 === "文件" ? (
          属性.项目 ? (
            <div style={{ paddingTop: 8 }}>
              <div className="统计行" style={{ padding: "0 12px" }}>
                <span className="胶囊">书内文件</span>
                <button className="胶囊" onClick={() => set拉树号((旧) => 旧 + 1)}>
                  刷新
                </button>
              </div>
              {树状态 ? <div className="微信息" style={{ padding: "0 12px 6px" }}>{树状态}</div> : null}
              <文件树 节点们={树} 当前={属性.当前文件} 打开={属性.打开文件} />
            </div>
          ) : (
            <div className="空态">还没有打开书库</div>
          )
        ) : null}
        {属性.页 === "台账" ? <台账面板 看板={属性.看板} /> : null}
        {属性.页 === "建议" ? (
          <div style={{ padding: "10px 12px 0" }}>
            <div className="统计行">
              <span className="胶囊">第 {章} 章</span>
              <span className="胶囊">{本章条目.length} 条待裁定</span>
            </div>
            {本章条目.length === 0 ? (
              <div className="空态">
                第 {章} 章没有待裁定建议
                <br />
                派活结束后，负责人回答里的设定修改意见会落到这里。
              </div>
            ) : null}
            {本章条目.map((条, 序) => (
              <div className="伏笔项" key={序}>
                <div className="伏笔头">
                  <span className="伏笔号">{序 + 1}</span>
                  <span className="伏笔名">{条.内容}</span>
                </div>
                <div className="伏笔尾">
                  {条.提者}（{条.角色}）· 依据：{条.依据 || "未写明"}
                </div>
                <div className="伏笔尾">状态：待定 —— 设定卡没动，改不改由你</div>
              </div>
            ))}
            <div className="微信息" style={{ marginTop: 10 }}>
              这里只记录、不采纳：没有一键应用，要改请自己动手。
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}