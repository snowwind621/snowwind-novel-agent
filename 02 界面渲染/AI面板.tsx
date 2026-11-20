// 只负责一件事：右侧对话栏——气泡消息、功能菜单、流式收字、用量与本轮累计。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 时刻 } from "./接口"
import type { 项目摘要, 看板数据, 设置, 对话事件, 对话条目, 用量 } from "./接口"
import { 组装系统提示 } from "../05 编排内核/章节提示词"
import { 该压缩, 取要压的, 造摘要提示, 拼用户输入, 估算词元, 续摘要 } from "../06 智能体运行时/对话压缩"
import type { 对话条 } from "../06 智能体运行时/对话压缩"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"

type 功能 = "对话" | "续写" | "改写选中" | "同步台账" | "派活"

const 功能们: 功能[] = ["对话", "续写", "改写选中", "同步台账", "派活"]

/** 说话人 → 图标：你/集群是人，总编/改写是笔，系统提示是警告。 */
const 说话人图标: Record<对话条目["谁"], 图标名> = { 你: "用户群", 总编: "笔", 改写: "笔", 集群: "用户群", 系统: "警告" }

const 占位: Record<功能, string> = {
  对话: "问问总编，或让它拆任务。Enter 发送，Shift+Enter 换行。",
  续写: "接着往下写多少字、往哪儿走（留空就按默认 600 字）",
  改写选中: "要原文怎么改，例如：更冷一点、删掉解释",
  同步台账: "台账会自己抽取，这里可以补一句说明（可留空）",
  派活: "给集群派一件活，例如：三叶这条线下一章该做什么",
}

function 千分(数: number): string {
  return 数.toLocaleString("zh-CN")
}

/** 命中率 = 命中 /（命中 + 未命中）；两个都为 0 或拿不到就显示「—」，不瞎算。 */
function 缓存率(命中: number | null, 未命中: number | null): string {
  if (命中 === null || 未命中 === null || 命中 + 未命中 <= 0) return "—"
  return Math.round((命中 / (命中 + 未命中)) * 100) + "%"
}

function 用量摘要(用?: 用量): string {
  if (!用) return "↑— ↓— · 缓存 —"
  return "↑" + 千分(用.输入) + " ↓" + 千分(用.输出) + " · 缓存 " + 缓存率(用.缓存命中, 用.缓存未命中)
}

/** 本轮累计：只把网关真给了用量的那几条加起来。 */
function 累计摘要(消息们: 对话条目[]): string {
  const 有 = 消息们.map((条) => 条.用量).filter((用): 用 is 用量 => Boolean(用))
  if (有.length === 0) return "本轮 ↑— ↓— · 缓存 —"
  const 输入 = 有.reduce((和, 用) => 和 + 用.输入, 0)
  const 输出 = 有.reduce((和, 用) => 和 + 用.输出, 0)
  const 命中们 = 有.filter((用) => 用.缓存命中 !== null && 用.缓存未命中 !== null)
  const 命中 = 命中们.reduce((和, 用) => 和 + (用.缓存命中 ?? 0), 0)
  const 未 = 命中们.reduce((和, 用) => 和 + (用.缓存未命中 ?? 0), 0)
  return "本轮 ↑" + 千分(输入) + " ↓" + 千分(输出) + " · 缓存 " + 缓存率(命中, 未)
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
  const { 消息们, 追加, 改条, 补条, 项目, 章节号, 标题, 正文, 设定, 看板, 采纳改写, 取选区 } = 属性
  const [功能选中, set功能选中] = useState<功能>("对话")
  const [菜单开, set菜单开] = useState(false)
  const [菜单方向, set菜单方向] = useState<{ 向上: boolean; 靠左: boolean; 最大高: number }>({ 向上: false, 靠左: false, 最大高: 240 })
  const [模型, set模型] = useState("")
  const [自定义模型, set自定义模型] = useState("")
  const [输入, set输入] = useState("")
  const [对话中, set对话中] = useState(false)
  const [错误, set错误] = useState("")
  const [提示, set提示] = useState("")
  const [摘要, set摘要] = useState("")
  const [已压条数, set已压条数] = useState(0)
  const 当前请求 = useRef("")
  const 底 = useRef<HTMLDivElement | null>(null)
  const 菜单锚 = useRef<HTMLDivElement | null>(null)

  const 分工 = 设定?.模型.分工
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

  // 清空对话时把压缩记忆一起清掉，免得新对话无缘无故背着旧摘要。
  useEffect(() => {
    if (消息们.length === 0) {
      set摘要("")
      set已压条数(0)
    }
  }, [消息们.length])

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
      } else if (事件.类型 === "用量") {
        try {
          补条(回条, { 用量: JSON.parse(事件.文本) as 用量 })
        } catch {
          /* 网关给的用量块不规范，就当没有，不报错 */
        }
      }
    })
    return 卸载
  }, [])

  // 菜单开着时，窗口一动就收起来：比跟着重算更稳，也不会飘到屏幕外。
  useEffect(() => {
    if (!菜单开) return
    const 关 = () => set菜单开(false)
    const 点外面 = (事件: PointerEvent) => {
      if (菜单锚.current && !菜单锚.current.contains(事件.target as Node)) set菜单开(false)
    }
    window.addEventListener("resize", 关)
    window.addEventListener("scroll", 关, true)
    document.addEventListener("pointerdown", 点外面, true)
    return () => {
      window.removeEventListener("resize", 关)
      window.removeEventListener("scroll", 关, true)
      document.removeEventListener("pointerdown", 点外面, true)
    }
  }, [菜单开])

  /** 贴着按钮右对齐；下方放不下就向上弹；靠屏幕左边就改左对齐；高度按剩余空间卡住并内部滚动。 */
  const 算菜单位置 = () => {
    const 框 = 菜单锚.current?.getBoundingClientRect()
    if (!框) return
    const 下方 = window.innerHeight - 框.bottom - 8
    const 上方 = 框.top - 8
    const 想开 = 功能们.length * 34 + 14
    const 向上 = 下方 < Math.min(想开, 200) && 上方 > 下方
    set菜单方向({
      向上,
      靠左: 框.left < 190,
      最大高: Math.max(120, Math.min(向上 ? 上方 : 下方, 320)),
    })
  }

  const 开菜单 = () => {
    if (!菜单开) 算菜单位置()
    set菜单开((旧) => !旧)
  }

  /** 用助手模型把较早的对话压成摘要；失败就当没压，不拦着用户发问。 */
  const 压摘要 = (要压: 对话条[]): Promise<string> =>
    new Promise((解决) => {
      const 请求号 = "压-" + Date.now() + Math.random().toString(16).slice(2)
      const 提示 = 造摘要提示(要压)
      let 文本 = ""
      const 卸载 = 桥.监听对话((事件: 对话事件) => {
        if (事件.请求号 !== 请求号) return
        if (事件.类型 === "正文") 文本 += 事件.文本
        else if (事件.类型 === "结束" || 事件.类型 === "错误") {
          卸载()
          解决(事件.类型 === "错误" ? "" : 文本.trim())
        }
      })
      void 桥
        .发送对话({ 请求号, 模型: 设定?.模型.分工.助手 ?? "", 系统提示: 提示.系统提示, 用户输入: 提示.用户输入, 温度: 0 })
        .catch(() => {
          卸载()
          解决("")
        })
    })

  const 发对话 = async (文本: string) => {
    const 干净 = 文本.trim()
    if (!干净 || 对话中) return
    const 请求号 = String(Date.now()) + Math.random().toString(16).slice(2)
    当前请求.current = 请求号

    // 先把「已经说过的话」整理成 摘要 + 最近若干条原文，再把这次的问题接上去。
    const 历史: 对话条[] = 消息们
      .filter((条) => 条.文本.trim() && !条.进行中 && !条.出错 && 条.谁 !== "系统")
      .map((条) => ({ 谁: 条.谁, 文本: 条.文本 }))
    let 摘要文 = 摘要
    let 已压 = 已压条数
    const 配置 = 设定?.上下文
    if (配置) {
      let 候选 = 历史.slice(已压)
      for (let 轮 = 0; 轮 < 3; 轮++) {
        const 估算 = 候选.reduce((和, 条) => 和 + 估算词元(条.文本), 0)
        if (!该压缩(候选.length, 估算, 配置)) break
        const { 要压, 保留 } = 取要压的(候选, 配置.压缩后保留条数)
        if (要压.length === 0) break
        const 新摘要 = await 压摘要(要压)
        if (!新摘要) break
        摘要文 = 续摘要(摘要文, 新摘要)
        已压 += 要压.length
        候选 = 保留
      }
      if (已压 !== 已压条数) {
        set摘要(摘要文)
        set已压条数(已压)
      }
    }

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
    await 桥.发送对话({ 请求号, 模型: 实际模型, 系统提示, 用户输入: 拼用户输入(摘要文, 历史.slice(已压), 干净) })
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
      <div className="对话头">
        <span className="图标-芯片" title="模型">
          <图标 名="芯片" 大小={15} />
        </span>
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
        <span className="胶囊">{章节号 ? "ch" + 章节号 : "无章节"}</span>
        <span className="用量累计" title="本轮所有回答的用量合计">
          {累计摘要(消息们)}
        </span>
        <div className="对话头右">
          <button className="小按钮 图标按钮" onClick={属性.清空对话} title="清空对话">
            <图标 名="清空" 大小={15} />
          </button>
          <button className="小按钮 图标按钮" onClick={导出} title="导出对话为 Markdown">
            <图标 名="下载" 大小={15} />
          </button>
        </div>
      </div>
      {提示 ? <div className="对话提示 微信息">{提示}</div> : null}

      <div className="流" ref={底}>
        {已压条数 > 0 ? (
          <div className="对话提示 微信息" title="较早的消息已用助手模型压成摘要，随每次提问一起带上">
            较早 {已压条数} 条已压缩
          </div>
        ) : null}
        {消息们.length === 0 ? (
          <div className="空态" style={{ padding: 24 }}>
            在设置里打开「智能体集群」派一件活；
            <br />
            或者直接在下面问、续写、改写。
          </div>
        ) : null}
        {消息们.map((条) => (
          <div key={条.id} className={"消息 谁-" + 条.谁}>
            <div className="气泡">
              <div className="气泡头">
                <图标 名={说话人图标[条.谁]} 大小={14} />
                <span className="气泡名">{条.谁}</span>
                {条.时间 ? <span className="微信息">{时刻(条.时间)}</span> : null}
                {条.进行中 ? <span className="微信息">正在生成…</span> : null}
                {条.被替代 ? <span className="微信息">（已被新版替代）</span> : null}
                <span className="消息操作">
                  <button className="小按钮 图标按钮" onClick={() => void 复制(条)} title="复制这条消息">
                    <图标 名="复制" 大小={14} />
                  </button>
                  {条.出错 ? (
                    <button className="小按钮 图标按钮" onClick={() => void 重跑(条)} title="重试这一条">
                      <图标 名="刷新" 大小={14} />
                    </button>
                  ) : null}
                  {!条.出错 && !条.进行中 && !条.被替代 && (条.谁 === "总编" || 条.谁 === "改写") && 原问(条) ? (
                    <button className="小按钮 图标按钮" onClick={() => void 重跑(条)} title="重新生成（旧回答标注为已替代）">
                      <图标 名="刷新" 大小={14} />
                    </button>
                  ) : null}
                </span>
              </div>
              <div className="消息体">{条.文本}</div>
              {条.谁 === "改写" && !条.进行中 && 条.文本.trim() ? (
                <div className="气泡动作">
                  <button className="小按钮" onClick={() => 采纳改写(条.id)} title="把改写结果替换回正文">
                    <图标 名="勾" 大小={14} />
                    替换原文
                  </button>
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
              {(条.谁 === "总编" || 条.谁 === "改写") && !条.进行中 ? (
                <div className="用量行">{用量摘要(条.用量)}</div>
              ) : null}
            </div>
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
          <div className="功能锚" ref={菜单锚}>
            <button className="功能按钮" onClick={开菜单} title="切换这次要做什么">
              <图标 名="列表" 大小={15} />
              功能 ▾ {功能选中}
            </button>
            {菜单开 ? (
              <div
                className="菜单 功能菜单"
                style={{
                  top: 菜单方向.向上 ? "auto" : "calc(100% + 4px)",
                  bottom: 菜单方向.向上 ? "calc(100% + 4px)" : "auto",
                  right: 菜单方向.靠左 ? "auto" : 0,
                  left: 菜单方向.靠左 ? 0 : "auto",
                  maxHeight: 菜单方向.最大高,
                  overflowY: "auto",
                }}
              >
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
            <button onClick={发送} disabled={忙 || (需要输入 && !输入.trim())} title="发送（Enter）">
              <图标 名="发送" 大小={15} />
              发送
            </button>
            <button onClick={() => void 停止()} disabled={!忙} title="停止生成">
              <图标 名="停止" 大小={14} />
              停止
            </button>
          </div>
        </div>
      </div>
      {错误 ? <div className="微信息" style={{ color: "var(--危)", padding: "0 12px 10px" }}>出错：{错误}</div> : null}
    </div>
  )
}