// 只负责一件事：设置页共用的小控件（分组标题、数字项、开关项、选择项、文本项）。
import React from "react"

export function 分组标题(属性: { 文: string; 说明?: string }) {
  return (
    <div className="设置分组">
      <span>{属性.文}</span>
      {属性.说明 ? <span className="设置分组说明">{属性.说明}</span> : null}
    </div>
  )
}

export function 数字项(属性: {
  标签: string
  说明: string
  值: number
  改: (值: number) => void
  最小: number
  最大: number
  步进?: number
  单位?: string
}) {
  const 取数 = (文本: string): number => {
    const 数 = Number(文本)
    return Number.isFinite(数) ? 数 : 属性.值
  }
  return (
    <div className="设置项">
      <label>{属性.标签}</label>
      <input
        className="数字框"
        type="number"
        min={属性.最小}
        max={属性.最大}
        step={属性.步进 ?? 1}
        value={String(属性.值)}
        onChange={(事件) => 属性.改(取数(事件.target.value))}
        onBlur={(事件) => {
          const 数 = Math.min(属性.最大, Math.max(属性.最小, 取数(事件.target.value)))
          if (数 !== 属性.值) 属性.改(数)
        }}
      />
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
        <input type="checkbox" checked={属性.值} onChange={(事件) => 属性.改(事件.target.checked)} />
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
      <select value={属性.值} onChange={(事件) => 属性.改(事件.target.value as T)}>
        {属性.选项.map((项) => (
          <option key={项.值} value={项.值}>
            {项.字}
          </option>
        ))}
      </select>
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
