// 只负责一件事：设置里的「书库」分组。
import React from "react"
import type { 书库设置 } from "../接口"
import { 分组标题, 开关项, 选择项, 文本项 } from "./共用"

export function 书库分组(属性: { 书库: 书库设置; 改: (补丁: Partial<书库设置>) => void; 迁移提示: string; 导入旧书库: () => void }) {
  const { 书库, 改 } = 属性
  return (
    <>
      <分组标题 文="当前书库" />
      <文本项 标签="上次打开的书库" 说明="跟着「打开书库」自动更新，不用手改。" 值={书库.上次路径} 改={() => undefined} 只读 />
      <div className="设置项">
        <label>书库迁移（旧格式 → 雪风卷宗，旧目录只读不动）</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={属性.导入旧书库}>从旧格式导入…</button>
          <span className="微信息">{属性.迁移提示}</span>
        </div>
      </div>

      <分组标题 文="校验" />
      <开关项 标签="校验器默认附带「修复建议」" 说明="关掉只报问题，不改文件；开着会给出改法（仍然要你点才动）。" 值={书库.校验修复建议} 改={(值) => 改({ 校验修复建议: 值 })} />

      <分组标题 文="导出" />
      <选择项
        标签="导出默认格式"
        说明="「导出」按钮不另选时用这个格式。"
        值={书库.导出格式}
        选项={[
          { 值: "docx", 字: "Word（docx）" },
          { 值: "markdown", 字: "Markdown（md）" },
          { 值: "epub", 字: "EPUB（epub）" },
        ]}
        改={(值) => 改({ 导出格式: 值 })}
      />
    </>
  )
}
