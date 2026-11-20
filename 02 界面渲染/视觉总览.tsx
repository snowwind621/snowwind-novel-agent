// 只负责一件事：中栏「全书视图」仪表盘——进度、字数节奏、伏笔甘特、人物出场、台账墙。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 千字 } from "./接口"
import type { 看板数据, 项目摘要 } from "./接口"
import { 图标 } from "./图标"
import { 进度环, 字数柱, 伏笔甘特, 人物条 } from "./图表"
import type { 人物条项, 章点, 伏笔条 } from "./图表"

/** 从「台账/出场追踪.md」的表格里取「姓名 / 最后出场」两列；读不到就给空。 */
function 解析出场(正文: string): 人物条项[] {
  const 结果: 人物条项[] = []
  let 头: string[] | null = null
  for (const 行 of 正文.split(/\r?\n/)) {
    const 修剪 = 行.trim()
    if (!修剪.startsWith("|")) {
      头 = null
      continue
    }
    const 格 = 修剪.replace(/^\||\|$/g, "").split("|").map((项) => 项.trim())
    if (!头) {
      const 有姓名 = 格.some((项) => 项.includes("姓名"))
      const 有出场 = 格.some((项) => 项.includes("最后出场"))
      if (有姓名 && 有出场) 头 = 格
      continue
    }
    if (格.every((项) => /^:?-+:?$/.test(项))) continue
    const 名列 = 头.findIndex((项) => 项.includes("姓名"))
    const 章列 = 头.findIndex((项) => 项.includes("最后出场"))
    const 名 = (格[名列] ?? "").replace(/\*/g, "").trim()
    const 数 = Number((/\d+/.exec(格[章列] ?? "") ?? [""])[0])
    if (名 && Number.isFinite(数)) 结果.push({ 名称: 名, 最后出场: 数 })
  }
  return 结果
}

/** 中栏顶部的「视图」级切换：编辑 / 全书视图。正文编辑那边也用它，保证两条是一样的按钮。 */
export function 视图切换(属性: { 当前: "编辑" | "全书"; 切: (视图: "编辑" | "全书") => void }) {
  return (
    <div className="编辑器-模式">
      <button
        className={"编辑器-模式按钮" + (属性.当前 === "编辑" ? " 选中" : "")}
        onClick={() => 属性.切("编辑")}
        title="回到正文编辑"
      >
        <图标 名="笔" 大小={15} />
        编辑
      </button>
      <button
        className={"编辑器-模式按钮" + (属性.当前 === "全书" ? " 选中" : "")}
        onClick={() => 属性.切("全书")}
        title="看全书的数据"
      >
        <图标 名="表格" 大小={15} />
        全书视图
      </button>
    </div>
  )
}

export function 视觉总览(属性: {
  项目: 项目摘要 | null
  看板: 看板数据 | null
  打开文件: (相对路径: string) => void
  切回编辑: () => void
}) {
  const [出场, set出场] = useState<人物条项[]>([])
  const [出场说明, set出场说明] = useState("")
  const [提示, set提示] = useState<{ 左: number; 上: number; 文: string } | null>(null)
  const 壳 = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!属性.项目) return
    let 有效 = true
    void (async () => {
      try {
        const 内容 = await 桥.书库读文件("台账/出场追踪.md")
        if (!有效) return
        const 人 = 解析出场(内容.是文本 ? 内容.文本 : "")
        set出场(人)
        set出场说明(人.length === 0 ? "出场追踪表里没读到「姓名 / 最后出场」两列" : "")
      } catch {
        if (!有效) return
        set出场([])
        set出场说明("还没读到 台账/出场追踪.md")
      }
    })()
    return () => {
      有效 = false
    }
  }, [属性.项目?.路径])

  const 悬停 = (水平: number, 垂直: number, 文: string) => {
    const 框 = 壳.current?.getBoundingClientRect()
    set提示({ 左: 水平 - (框?.left ?? 0) + 12, 上: 垂直 - (框?.top ?? 0) + 14, 文 })
  }

  if (!属性.项目) {
    return (
      <div className="中栏">
        <div className="编辑器-工具行">
          <视图切换 当前="全书" 切={() => 属性.切回编辑()} />
        </div>
        <div className="空态">还没有打开书库；打开后这里会画出全书的数据。</div>
      </div>
    )
  }

  const 章们: 章点[] = 属性.项目.卷.flatMap((卷) => 卷.章节.map((章) => ({ 编号: 章.编号, 标题: 章.标题, 字数: 章.字数 })))
  const 章数 = 章们.length
  const 总字 = 章们.reduce((和, 章) => 和 + 章.字数, 0)
  const 均值 = 章数 > 0 ? Math.round(总字 / 章数) : 0
  const 统计 = 属性.看板?.统计
  const 伏笔们: 伏笔条[] = (属性.看板?.伏笔 ?? []).map((项) => ({
    编号: 项.编号,
    名称: 项.名称,
    埋章: 项.埋章,
    兑章: 项.兑章,
    预定章: 项.预定章,
    状态: 项.状态,
    搁置章数: 项.搁置章数,
    超期: 项.超期,
    久置: 项.久置,
  }))
  const 排序后 = [...伏笔们].sort((甲, 乙) => Number(乙.超期) - Number(甲.超期) || Number(乙.久置) - Number(甲.久置))
  const 人物们 = [...出场].sort((甲, 乙) => 乙.最后出场 - 甲.最后出场)
  const 已兑现 = 统计?.已兑现 ?? 0
  const 伏笔总 = 统计?.总数 ?? 0
  const 兑现率 = 伏笔总 > 0 ? 已兑现 / 伏笔总 : 0
  const 台账们 = 属性.看板?.台账 ?? []

  return (
    <div className="中栏">
      <div className="编辑器-工具行">
        <视图切换 当前="全书" 切={() => 属性.切回编辑()} />
        <span className="编辑器-分隔" />
        <span className="编辑器-提示">全书视图只读；点左边的章会切回编辑并打开那一章。</span>
      </div>

      <div className="总览" ref={壳}>
        <div className="总览块 概览块">
          <div className="总览头">
            <span>进度</span>
            <span>{属性.项目.书名}</span>
          </div>
          <div className="概览行">
            <进度环 比例={兑现率} 主文={Math.round(兑现率 * 100) + "%"} 副文={已兑现 + "/" + 伏笔总 + " 伏笔"} />
            <div className="关键数">
              <div className="数项">
                <b>{千字(总字)}</b>
                <span>总字数</span>
              </div>
              <div className="数项">
                <b>{章数}</b>
                <span>章数</span>
              </div>
              <div className="数项">
                <b>{均值.toLocaleString("zh-CN")}</b>
                <span>平均章长</span>
              </div>
              <div className="数项">
                <b>{"ch" + (属性.项目.统计.最新章节 || 0)}</b>
                <span>最新章</span>
              </div>
              <div className={"数项" + (统计?.超期 ? " 危" : "")}>
                <b>{统计?.超期 ?? 0}</b>
                <span>超期伏笔</span>
              </div>
            </div>
          </div>
        </div>

        <div className="总览块">
          <div className="总览头">
            <span>每章字数</span>
            <span>均值 {均值.toLocaleString("zh-CN")} 字 · 短章黄 / 长章蓝</span>
          </div>
          {章数 === 0 ? (
            <div className="总览空">还没有章节</div>
          ) : (
            <div className="图滚">
              <字数柱 章们={章们} 均值={均值} 悬停={悬停} 离开={() => set提示(null)} />
            </div>
          )}
        </div>

        <div className="总览块 甘特块">
          <div className="总览头">
            <span>伏笔生命周期</span>
            <span>● 埋点　■ 兑点　红=超期　橙=久置</span>
          </div>
          {排序后.length === 0 ? (
            <div className="总览空">还没有伏笔</div>
          ) : (
            <伏笔甘特 伏笔们={排序后} 最新章节={属性.项目.统计.最新章节 || 0} 悬停={悬停} 离开={() => set提示(null)} />
          )}
        </div>

        <div className="总览块">
          <div className="总览头">
            <span>人物最后出场</span>
            <span>越靠下越久没出场 · 超过 10 章标红</span>
          </div>
          {人物们.length === 0 ? (
            <div className="总览空">{出场说明 || "还没有人物数据"}</div>
          ) : (
            <人物条 人物们={人物们} 最新章节={属性.项目.统计.最新章节 || 0} 悬停={悬停} 离开={() => set提示(null)} />
          )}
        </div>

        <div className="总览块">
          <div className="总览头">
            <span>台账</span>
            <span>{台账们.length} 册 · 点卡片看原文</span>
          </div>
          {台账们.length === 0 ? (
            <div className="总览空">这个书库里还没有「台账」目录</div>
          ) : (
            <div className="台账墙">
              {台账们.map((卡) => (
                <button
                  key={卡.相对路径}
                  className="台账卡"
                  title={卡.相对路径}
                  onClick={() => 属性.打开文件(卡.相对路径)}
                >
                  <div className="台账卡头">
                    <span>{卡.名称}</span>
                    <span className="徽">{卡.行数} 行</span>
                  </div>
                  <div className="台账卡摘">{卡.摘录 || "（空）"}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {提示 ? (
          <div className="图表提示" style={{ left: 提示.左, top: 提示.上 }}>
            {提示.文}
          </div>
        ) : null}
      </div>
    </div>
  )
}
