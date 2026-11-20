// 只负责一件事：设置页共用的小控件（分组标题、滑块数字项、开关、分段枚举、文本框）。
import React from "react"

export function 分组标题(属性: { 文: string; 说明?: string }) {
  return (
    <div className="设置分组">
      <span>{属性.文}</span>
      {属性.说明 ? <span className="设置分组说明">{属性.说明}</span> : null}
    </div>
  )
}

/** 无极调整：滑块拖动只改草稿，右侧同步显示数值。 */
export function 数字项(属性: {
  标签: string
  说明: string
  值: number
  改: (值: number) => void
  最小: number
  最大: number
  步进?: number
  单位?: string
  小数?: number
}) {
  const 位 = 属性.小数 ?? (属性.步进 && 属性.步进 < 1 ? 2 : 0)
  const 显示 = 属性.值.toFixed(位)
  return (
    <div className="设置项">
      <label>{属性.标签}</label>
      <div className="滑块行">
        <input
          className="滑块"
          type="range"
          min={属性.最小}
          max={属性.最大}
          step={属性.步进 ?? 0.01}
          value={属性.值}
          onChange={(事件) => 属性.改(Number(事件.target.value))}
          title={属性.说明}
        />
        <span className="滑数值">
          {显示}
          {属性.单位 ? <span className="滑数单位">{属性.单位}</span> : null}
        </span>
      </div>
      <div className="设置说明">
        {属性.说明}（{属性.最小}–{属性.最大}{属性.单位 ? " " + 属性.单位 : ""}）
      </div>
    </div>
  )
}

export function 开关项(属性: { 标签: string; 说明: string; 值: boolean; 改: (值: boolean) => void }) {
  return (
    <div className="设置项">
      <label className="开关行">
        <input type="checkbox" className="开关" checked={属性.值} onChange={(事件) => 属性.改(事件.target.checked)} />
        {属性.标签}
      </label>
      <div className="设置说明">{属性.说明}</div>
    </div>
  )
}

export function 选择项<T extends string>(属性: {
  标签: string
  说明: string
  值: T
  选项: Array<{ 值: T; 字: string }>
  改: (值: T) => void
}) {
  return (
    <div className="设置项">
      <label>{属性.标签}</label>
      <div className="分段 设置分段">
        {属性.选项.map((项) => (
          <button
            key={项.值}
            className={"分段按钮" + (属性.值 === 项.值 ? " 选中" : "")}
            onClick={() => 属性.改(项.值)}
            title={项.字}
          >
            {项.字}
          </button>
        ))}
      </div>
      <div className="设置说明">{属性.说明}</div>
    </div>
  )
}

export function 文本项(属性: {
  标签: string
  说明: string
  值: string
  改: (值: string) => void
  占位?: string
  密码?: boolean
  只读?: boolean
}) {
  return (
    <div className="设置项">
      <label>{属性.标签}</label>
      <input
        type={属性.密码 ? "password" : "text"}
        value={属性.值}
        readOnly={属性.只读}
        placeholder={属性.占位}
        onChange={(事件) => 属性.改(事件.target.value)}
      />
      {属性.说明 ? <div className="设置说明">{属性.说明}</div> : null}
    </div>
  )
}
