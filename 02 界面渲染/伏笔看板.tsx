// 只负责一件事：把伏笔按「超期 / 久置 / 待兑现 / 未记埋 / 已兑现」摊开，并支持搜索。
import React, { useState } from "react"
import type { 看板数据 } from "./接口"

export function 伏笔看板(属性: { 看板: 看板数据 | null }) {
  const [词, set词] = useState("")
  const 看板 = 属性.看板

  if (!看板) return <div className="空态">尚未读取台账</div>

  const 命中 = 看板.伏笔.filter((项) => {
    const 词条 = 词.trim()
    if (!词条) return true
    return 项.编号.includes(词条) || 项.名称.includes(词条) || 项.兑了什么.includes(词条)
  })

  const 组 = [
    { 名: "已超期（该兑了）", 项: 命中.filter((x) => x.超期) },
    { 名: "搁置太久（超过 " + 15 + " 章没动）", 项: 命中.filter((x) => x.久置) },
    { 名: "待兑现", 项: 命中.filter((x) => x.状态 === "待兑现" && !x.超期 && !x.久置) },
    { 名: "未记埋", 项: 命中.filter((x) => x.状态 === "未记埋") },
    { 名: "已兑现", 项: 命中.filter((x) => x.状态 === "已兑现") },
  ]

  return (
    <div>
      <div className="统计行">
        <span className="胶囊">共 {看板.统计.总数}</span>
        <span className="胶囊 危">超期 {看板.统计.超期}</span>
        <span className="胶囊 警">久置 {看板.统计.久置}</span>
        <span className="胶囊">待兑 {看板.统计.待兑现}</span>
        <span className="胶囊 好">已兑 {看板.统计.已兑现}</span>
        <span className="胶囊">最新 ch{看板.最新章节}</span>
      </div>
      <input className="搜索框" placeholder="搜编号、名称或兑现内容…" value={词} onChange={(事件) => set词(事件.target.value)} />

      {组.map((分组) =>
        分组.项.length === 0 ? null : (
          <div key={分组.名}>
            <div className="卷标题">
              {分组.名} · {分组.项.length}
            </div>
            {分组.项.map((项) => (
              <div key={项.编号} className={"伏笔项" + (项.超期 ? " 超期" : "")}>
                <div className="伏笔头">
                  <span className="伏笔号">{项.编号}</span>
                  <span className="伏笔名">{项.名称}</span>
                  <span className={"徽 " + (项.状态 === "已兑现" ? "已完成" : 项.超期 ? "超期" : "")}>
                    {项.超期 ? "超期" : 项.久置 ? "久置" : 项.状态}
                  </span>
                </div>
                <div className="伏笔尾">
                  埋于 {项.埋章 === null ? "—" : "ch" + 项.埋章}
                  {项.状态 === "待兑现" ? "　已搁置 " + 项.搁置章数 + " 章" : ""}
                  {项.兑章.length > 0 ? "　兑于 " + 项.兑章.map((n) => "ch" + n).join("／") : ""}
                  {项.预定章.length > 0 ? "　预定 " + 项.预定章.map((n) => "ch" + n).join("／") : ""}
                  {项.参考间隔 !== null ? "　间隔 " + 项.参考间隔 + " 章" : ""}
                  {项.重要程度 ? "　" + 项.重要程度 : ""}
                </div>
                {项.兑了什么 ? <div className="伏笔尾">{项.兑了什么.slice(0, 120)}</div> : null}
              </div>
            ))}
          </div>
        ),
      )}
      {命中.length === 0 ? <div className="空态">没有匹配的伏笔</div> : null}
    </div>
  )
}
