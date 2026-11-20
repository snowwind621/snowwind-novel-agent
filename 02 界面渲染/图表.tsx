// 只负责一件事：手绘内联 SVG 图表原语（环、柱、甘特、条形），不依赖任何图表库。
import React from "react"

export interface 章点 {
  编号: number
  标题: string
  字数: number
}

export interface 伏笔条 {
  编号: string
  名称: string
  埋章: number | null
  兑章: number[]
  预定章: number[]
  状态: string
  搁置章数: number
  超期: boolean
  久置: boolean
}

export interface 人物条项 {
  名称: string
  最后出场: number
}

type 悬停 = (水平: number, 垂直: number, 文本: string) => void

/** 进度环：一条底环 + 一条按比例画出的值环，中心两行字。 */
export function 进度环(属性: { 比例: number; 主文: string; 副文: string }) {
  const 半径 = 46
  const 周长 = 2 * Math.PI * 半径
  const 比例 = Math.max(0, Math.min(1, Number.isFinite(属性.比例) ? 属性.比例 : 0))
  return (
    <svg className="环图" viewBox="0 0 120 120" width={130} height={130} role="img" aria-label={属性.主文}>
      <circle className="环底" cx="60" cy="60" r={半径} />
      <circle className="环值" cx="60" cy="60" r={半径} strokeDasharray={周长 * 比例 + " " + 周长} />
      <text className="环主" x="60" y="58" textAnchor="middle">
        {属性.主文}
      </text>
      <text className="环副" x="60" y="76" textAnchor="middle">
        {属性.副文}
      </text>
    </svg>
  )
}

/** 每章字数柱：低于均值 60% 标黄、高于 140% 标蓝，一眼看出节奏。 */
export function 字数柱(属性: { 章们: 章点[]; 均值: number; 悬停: 悬停; 离开: () => void }) {
  const 边 = 26
  const 底 = 150
  const 高 = 132
  const 柱宽 = 14
  const 步 = 26
  const 宽 = 边 * 2 + Math.max(属性.章们.length, 1) * 步
  const 最大 = Math.max(1, ...属性.章们.map((章) => 章.字数))
  return (
    <svg className="柱图" viewBox={"0 0 " + 宽 + " " + (底 + 24)} width={宽} height={底 + 24} role="img">
      <line className="轴" x1={边 - 6} y1={底} x2={宽 - 边 + 6} y2={底} />
      <line className="均值线" x1={边 - 6} y1={底 - (属性.均值 / 最大) * 高} x2={宽 - 边 + 6} y2={底 - (属性.均值 / 最大) * 高} />
      {属性.章们.map((章, 序) => {
        const 柱高 = Math.max(2, (章.字数 / 最大) * 高)
        const 类 =
          属性.均值 > 0 && 章.字数 < 属性.均值 * 0.6
            ? "柱 短"
            : 属性.均值 > 0 && 章.字数 > 属性.均值 * 1.4
              ? "柱 长"
              : "柱"
        const x = 边 + 序 * 步
        const 说明 = "ch" + 章.编号 + " " + 章.标题 + "：" + 章.字数 + " 字"
        return (
          <g key={章.编号}>
            <rect
              className={类}
              x={x}
              y={底 - 柱高}
              width={柱宽}
              height={柱高}
              rx={3}
              onMouseEnter={(事件) => 属性.悬停(事件.clientX, 事件.clientY, 说明)}
              onMouseMove={(事件) => 属性.悬停(事件.clientX, 事件.clientY, 说明)}
              onMouseLeave={属性.离开}
            />
            {序 % 5 === 0 ? (
              <text className="轴字" x={x + 柱宽 / 2} y={底 + 16} textAnchor="middle">
                {章.编号}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

/** 伏笔生命周期甘特：横轴章号，埋点圆 / 兑点方，超期整条红、久置整条橙。 */
export function 伏笔甘特(属性: { 伏笔们: 伏笔条[]; 最新章节: number; 悬停: 悬停; 离开: () => void }) {
  const 左 = 58
  const 右 = 16
  const 行高 = 24
  const 顶 = 20
  const 宽 = 760
  const 末章 = Math.max(
    属性.最新章节,
    ...属性.伏笔们.map((项) => Math.max(项.埋章 ?? 0, ...项.兑章, ...项.预定章, 1)),
  )
  const 高 = 顶 + Math.max(属性.伏笔们.length, 1) * 行高 + 26
  const 位 = (章: number) => 左 + ((Math.max(1, 章) - 1) / Math.max(1, 末章 - 1)) * (宽 - 左 - 右)
  const 刻度们 = [1, Math.round(末章 / 4), Math.round(末章 / 2), Math.round((3 * 末章) / 4), 末章]
  return (
    <svg className="甘特图" viewBox={"0 0 " + 宽 + " " + 高} width="100%" height={高} role="img">
      {刻度们.map((章, 序) => (
        <g key={"刻" + 序}>
          <line className="轴" x1={位(章)} y1={顶 - 6} x2={位(章)} y2={高 - 20} />
          <text className="轴字" x={位(章)} y={高 - 6} textAnchor="middle">
            {章}
          </text>
        </g>
      ))}
      {属性.伏笔们.map((项, 序) => {
        const y = 顶 + 序 * 行高 + 行高 / 2
        const 起 = 项.埋章 === null ? 1 : 项.埋章
        const 兑 = 项.兑章.length > 0 ? 项.兑章[0] : 项.预定章.length > 0 ? 项.预定章[0] : 末章
        const 条类 = 项.超期 ? "甘特条 超期" : 项.久置 ? "甘特条 久置" : 项.状态 === "已兑现" ? "甘特条 已兑" : "甘特条"
        const 说明 =
          项.编号 +
          " " +
          项.名称 +
          "：埋于 ch" +
          (项.埋章 === null ? "?" : 项.埋章) +
          (项.兑章.length > 0 ? "，兑于 ch" + 项.兑章.join("／") : "，未兑") +
          (项.搁置章数 > 0 ? "，已搁置 " + 项.搁置章数 + " 章" : "") +
          (项.超期 ? "（超期）" : 项.久置 ? "（久置）" : "")
        return (
          <g
            key={项.编号}
            onMouseEnter={(事件) => 属性.悬停(事件.clientX, 事件.clientY, 说明)}
            onMouseMove={(事件) => 属性.悬停(事件.clientX, 事件.clientY, 说明)}
            onMouseLeave={属性.离开}
          >
            <rect className="甘特行底" x={0} y={y - 行高 / 2} width={宽} height={行高} />
            <text className={"甘特号" + (项.超期 ? " 超期" : 项.久置 ? " 久置" : "")} x={8} y={y + 4}>
              {项.编号}
            </text>
            <line className={条类} x1={位(起)} y1={y} x2={位(兑)} y2={y} />
            <circle className={"甘特点" + (项.超期 ? " 超期" : 项.久置 ? " 久置" : "")} cx={位(起)} cy={y} r={4.5} />
            <rect
              className={"甘特兑" + (项.兑章.length > 0 ? " 已兑" : 项.超期 ? " 超期" : 项.久置 ? " 久置" : "")}
              x={位(兑) - 4.5}
              y={y - 4.5}
              width={9}
              height={9}
              rx={1.5}
            />
          </g>
        )
      })}
    </svg>
  )
}

/** 人物最后出场：条越长越久没出场，超过 10 章标警示色。 */
export function 人物条(属性: { 人物们: 人物条项[]; 最新章节: number; 悬停: 悬停; 离开: () => void }) {
  const 左 = 76
  const 行高 = 24
  const 步 = Math.max(1, ...属性.人物们.map((人) => 属性.最新章节 - 人.最后出场))
  const 宽 = 460
  const 高 = Math.max(属性.人物们.length, 1) * 行高 + 12
  return (
    <svg className="人物图" viewBox={"0 0 " + 宽 + " " + 高} width="100%" height={高} role="img">
      {属性.人物们.map((人, 序) => {
        const 丢 = 属性.最新章节 - 人.最后出场
        const 条宽 = Math.max(3, (丢 / 步) * (宽 - 左 - 90))
        const y = 序 * 行高 + 6
        const 说明 = 人.名称 + "：最后出场 ch" + 人.最后出场 + "，已 " + 丢 + " 章没出场"
        return (
          <g key={人.名称}>
            <text className="人物名" x={6} y={y + 13}>
              {人.名称}
            </text>
            <rect
              className={"人物条" + (丢 > 10 ? " 警示" : "")}
              x={左}
              y={y + 3}
              width={条宽}
              height={14}
              rx={3}
              onMouseEnter={(事件) => 属性.悬停(事件.clientX, 事件.clientY, 说明)}
              onMouseMove={(事件) => 属性.悬停(事件.clientX, 事件.clientY, 说明)}
              onMouseLeave={属性.离开}
            />
            <text className={"人物数" + (丢 > 10 ? " 警示" : "")} x={左 + 条宽 + 8} y={y + 14}>
              {丢 > 0 ? 丢 + " 章没出场" : "本章在场"}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
