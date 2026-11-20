// 只负责一件事：右侧对话栏——功能菜单、消息列表、流式收字、停止与重发。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 时刻 } from "./接口"
import type { 项目摘要, 看板数据, 设置, 对话事件, 对话条目 } from "./接口"
import { 组装系统提示 } from "../05 编排内核/章节提示词"

type 功能 = "对话" | "续写" | "改写选中" | "同步台账" | "派活"

const 功能们: 功能[] = ["对话", "续写", "改写选中", "同步台账", "派活"]

const 占位: Record<功能, string> = {
  对话: "问问总编，或让它拆任务。Enter 发送，Shift+Enter 换行。",
  续写: "接着往下写多少字、往哪儿走（留空就按默认 600 字）",
  改写选中: "要原文怎么改，例如：更冷一点、删掉解释",
  同步台账: "台账会自己抽取，这里可以补一句说明（可留空）",
  派活: "给集群派一件活，例如：三叶这条线下一章该做什么",
}

export function AI面板(属性: {
  消息们: 对话条目[]
  追加: (条: 对话条目) => void
  改条: (id: string, 补: string) => void
  补条: (id: string, 补丁: Partial<对话条目>) => void
  项目: 项目摘要 | null
  章节号: number | null
  标题: string
  正文: string
  设定: 设置 | null
  看板: 看板数据 | null
  追加正文: (文本: string) => void
  采纳改写: (消息id: string) => void
  取选区: () => { 原文: string; 起点: number; 终点: number } | null
  续写: (指令: string) => void
  改写: (参数: { 原文: string; 起点: number; 终点: number; 指令: string }) => void
  同步台账: () => void
  派活: (任务: string) => void
  停止AI: () => void
  清空对话: () => void
  导出对话: () => Promise<string>
  忙: boolean
}) {
  const { 消息们, 追加, 改条, 补条, 项目, 章节号, 标题, 正文, 设定, 看板, 追加正文, 采纳改写, 取选区 } = 属性
  const [功能选中, set功能选中] = useState<功能>("对话")
  const [菜单开, set菜单开] = useState(false)
  const [模型, set模型] = useState("")
  const [自定义模型, set自定义模型] = useState("")
  const [输入, set输入] = useState("")
  const [对话中, set对话中] = useState(false)
  const [错误, set错误] = useState("")
  const [提示, set提示] = useState("")
  const 当前请求 = useRef("")
  const 底 = useRef<HTMLDivElement | null>(null)

  const 分工 = 设定?.分工
  const 模型们 = Array.from(new Set([分工?.总编, 分工?.执笔, 分工?.审校, 分工?.助手].filter(Boolean) as string[]))
  const 实际模型 = 模型 === "__自定义" ? 自定义模型.trim() : 模型 || (分工?.助手 ?? "")
  const 忙 = 属性.忙 || 对话中
  const 需要输入 = 功能选中 === "对话" || 功能选中 === "派活"

  useEffect(() => {
    set模型((旧) => 旧 || (分工?.助手 ?? ""))
  }, [分工?.助手])

  useEffect(() => {
    底.current?.scrollTo({ top: 底.current.scrollHeight, behavior: "smooth" })
  }, [消息们])

  useEffect(() => {
    const 卸载 = 桥.监听对话((事件: 对话事件) => {
      if (事件.请求号 !== 当前请求.current) return
      const 回条 = 事件.请求号 + "-回"
      if (事件.类型 === "正文") 改条(回条, 事件.文本)
      else if (事件.类型 === "结束") {
        补条(回条, { 进行中: false })
        set对话中(false)
      } else if (事件.类型 === "错误") {
        改条(回条, "\n[出错] " + 事件.文本)
        补条(回条, { 进行中: false, 出错: true })
        set错误(事件.文本)
        set对话中(false)
      }
    })
    return 卸载
  }, [])

  const 发对话 = async (文本: string) => {
    const 干净 = 文本.trim()
    if (!干净 || 对话中) return
    const 请求号 = String(Date.now()) + Math.random().toString(16).slice(2)
    当前请求.current = 请求号
    追加({ id: 请求号 + "-我", 谁: "你", 文本: 干净 })
    追加({ id: 请求号 + "-回", 谁: "总编", 文本: "", 进行中: true })
    set对话中(true)
    set错误("")
    set输入("")
    const 系统提示 = 组装系统提示({
      书名: 项目?.书名 ?? "未命名作品",
      章节号: 章节号 ?? 0,
      章节标题: 标题 || "创作讨论",
      伏笔: 看板?.伏笔 ?? [],
      正文尾部: 正文,
    })
    await 桥.发送对话({ 请求号, 模型: 实际模型, 系统提示, 用户输入: 干净 })
  }

  const 发送 = () => {
    if (忙) return
    const 文本 = 输入.trim()
    if (功能选中 === "对话") void 发对话(文本)
    else if (功能选中 === "续写") {
      属性.续写(文本)
      set输入("")
    } else if (功能选中 === "改写选中") {
      const 选区 = 取选区()
      if (!选区) {
        set错误("先在正文里选中一段，再点发送。")
        return
      }
      set错误("")
      属性.改写({ ...选区, 指令: 文本 })
      set输入("")
    } else if (功能选中 === "同步台账") {
      属性.同步台账()
      set输入("")
    } else {
      if (!文本) return
      属性.派活(文本)
      set输入("")
    }
  }

  const 停止 = async () => {
    if (当前请求.current && 对话中) await 桥.中止对话(当前请求.current)
    属性.停止AI()
    set对话中(false)
  }

  /** 一条回答对应的原始输入：往前找最近的一条「你」。 */
  const 原问 = (条: 对话条目): string => {
    const 序 = 消息们.findIndex((项) => 项.id === 条.id)
    for (let i = 序 - 1; i >= 0; i--) if (消息们[i].谁 === "你") return 消息们[i].文本
    return ""
  }

  const 重跑 = async (条: 对话条目) => {
    const 问 = 原问(条)
    if (!问) {
      set错误("找不到这条回答对应的输入")
      return
    }
    if (条.出错) 补条(条.id, { 出错: false, 文本: 条.文本.replace(/\n\[出错\][\s\S]*$/, ""), 进行中: false })
    else 补条(条.id, { 被替代: true })
    await 发对话(问)
  }

  const 复制 = async (条: 对话条目) => {
    try {
      await navigator.clipboard.writeText(条.文本)
      set提示("已复制一条消息")
    } catch {
      set提示("复制失败：浏览器不给剪贴板权限")
    }
  }

  const 导出 = async () => {
    set提示("正在导出…")
    try {
      set提示(await 属性.导出对话())
    } catch (错误: any) {
      set提示("导出失败：" + String(错误?.message ?? 错误))
    }
  }

  return (
    <div className="对话区">
      <div className="工具行">
        <select className="工具下拉" value={模型 || "__自定义"} onChange={(事件) => set模型(事件.target.value)} title="这次对话用哪个模型">
          {模型们.map((名) => (
            <option key={名} value={名}>
              {名}
            </option>
          ))}
          <option value="__自定义">自定义…</option>
        </select>
        {模型 === "__自定义" ? (
          <input
            className="工具输入"
            placeholder="模型名"
            value={自定义模型}
            onChange={(事件) => set自定义模型(事件.target.value)}
          />
        ) : null}
        <span className="胶囊">{章节号 ? "ch" + 章节号 + " 上下文" : "无章节上下文"}</span>
        <button className="胶囊" onClick={属性.清空对话}>
          清空对话
        </button>
        <button className="胶囊" onClick={导出}>
          导出对话
        </button>
      </div>
      {提示 ? <div className="微信息">{提示}</div> : null}

      <div className="流" ref={底}>
        {消息们.length === 0 ? (
          <div className="空态" style={{ padding: 24 }}>
            在设置里打开「智能体集群」派一件活；
            <br />
            或者直接在下面问、续写、改写。
          </div>
        ) : null}
        {消息们.map((条) => (
          <div key={条.id} className={"消息 谁-" + 条.谁}>
            <div className="消息头">
              <span>{条.谁}</span>
              {条.时间 ? <span className="微信息">{时刻(条.时间)}</span> : null}
              {条.进行中 ? <span className="微信息">正在生成…</span> : null}
              {条.被替代 ? <span className="微信息">（已被新版替代）</span> : null}
              <span className="消息操作">
                <button className="小按钮" onClick={() => void 复制(条)}>
                  复制
                </button>
                {条.出错 ? (
                  <button className="小按钮" onClick={() => void 重跑(条)}>
                    重试
                  </button>
                ) : null}
                {!条.出错 && !条.进行中 && !条.被替代 && (条.谁 === "总编" || 条.谁 === "改写") && 原问(条) ? (
                  <button className="小按钮" onClick={() => void 重跑(条)}>
                    重新生成
                  </button>
                ) : null}
              </span>
            </div>
            <div className="消息体">{条.文本}</div>
            {条.谁 === "总编" && !条.进行中 && 条.文本.trim() ? (
              <div style={{ marginTop: 6 }}>
                <button onClick={() => 追加正文(条.文本)}>插入正文末尾</button>
              </div>
            ) : null}
            {条.谁 === "改写" && !条.进行中 && 条.文本.trim() ? (
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <button onClick={() => 采纳改写(条.id)}>替换原文</button>
              </div>
            ) : null}
            {条.明细 ? (
              <details className="明细">
                <summary>各位负责人的原始回答 · {条.明细.length}</summary>
                {条.明细.map((项, 序) => (
                  <div className="明细项" key={序}>
                    <b>
                      {项.成员}（{项.角色}）
                    </b>
                    <div>{项.产出}</div>
                  </div>
                ))}
              </details>
            ) : null}
          </div>
        ))}
      </div>

      <div className="输入区">
        <textarea
          className="输入框"
          placeholder={占位[功能选中]}
          value={输入}
          onChange={(事件) => set输入(事件.target.value)}
          onKeyDown={(事件) => {
            if (事件.key === "Enter" && !事件.shiftKey && !事件.ctrlKey && !事件.metaKey) {
              事件.preventDefault()
              发送()
            }
          }}
        />
        <div className="操作行">
          <div style={{ position: "relative" }}>
            <button className="功能按钮" onClick={() => set菜单开((旧) => !旧)}>
              功能 ▾ {功能选中}
            </button>
            {菜单开 ? (
              <div className="菜单 功能菜单">
                {功能们.map((名) => (
                  <div
                    key={名}
                    className={"菜单项" + (名 === 功能选中 ? " 选中" : "")}
                    onClick={() => {
                      set功能选中(名)
                      set菜单开(false)
                      set错误("")
                    }}
                  >
                    {名}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <span className="微信息">{忙 ? "正在跑…" : "Enter 发送 · Shift+Enter 换行"}</span>
          <div className="操作右">
            <button onClick={发送} disabled={忙 || (需要输入 && !输入.trim())}>
              发送
            </button>
            <button onClick={() => void 停止()} disabled={!忙}>
              停止
            </button>
          </div>
        </div>
      </div>
      {错误 ? <div className="微信息" style={{ color: "var(--危)" }}>出错：{错误}</div> : null}
    </div>
  )
}