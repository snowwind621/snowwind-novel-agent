// 只负责一件事：把「卷 → 章」渲染成可点击的目录（不含外框，外框由左栏给）。
import React from "react"
import type { 项目摘要 } from "./接口"

export function 章节树(属性: {
  项目: 项目摘要
  当前章: number | null
  选章: (编号: number) => void
}) {
  const { 项目, 当前章, 选章 } = 属性
  return (
    <>
      {项目.卷.map((卷) => (
        <div key={卷.编号}>
          <div className="卷标题">
            <span>卷 {卷.编号}</span>
            <span>{卷.章节.length} 章</span>
          </div>
          {卷.章节.map((章) => (
            <div
              key={章.编号}
              className={"章项" + (章.编号 === 当前章 ? " 选中" : "")}
              onClick={() => 选章(章.编号)}
              title={章.标题}
            >
              <span className="章号">{"ch" + 章.编号}</span>
              <span className="章题">{章.标题}</span>
              <span className="章字">{章.字数 > 0 ? 章.字数 : "—"}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
