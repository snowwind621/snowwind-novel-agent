// 只负责一件事：右侧对话栏——对话 / 讨论 / 计划三种模式，气泡、流式收字、用量与本轮累计。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 时刻 } from "./接口"
import type { 看板数据, 设置, 项目摘要, 集群成员, 对话事件, 对话条目, 用量 } from "./接口"
import { 组装系统提示 } from "../05 编排内核/章节提示词"
import { 该压缩, 取要压的, 造摘要提示, 拼用户输入, 估算词元, 续摘要 } from "../06 智能体运行时/对话压缩"
import { 计划 } from "../10 书库检索/书库布局"
import type { 对话条 } from "../06 智能体运行时/对话压缩"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"
import "./对话样式.css"

type 模式 = "对话" | "讨论" | "计划"

const 模式们: 模式[] = ["对话", "讨论", "计划"]
const 模式图标: Record<模式, 图标名> = { 对话: "笔", 讨论: "用户群", 计划: "灯泡" }
const 模式键 = "对话模式"

const 占位: Record<模式, string> = {
  对话: "直接说你要什么。Enter 发送，Shift+Enter 换行。",
  讨论: "把议题抛给集群：他们一个个接着说，最后由总编收口。",
  计划: "",
}

/** 说话人 → 图标：你/集群/成员是人，总编是笔，系统提示是警告。 */
const 说话人图标: Record<对话条目["谁"], 图标名> = { 你: "用户群", 总编: "笔", 改写: "笔", 集群: "用户群", 系统: "警告" }

function 读模式(): 模式 {
  try {
    const 存 = localStorage.getItem(模式键)
    if (存 === "讨论" || 存 === "计划") return 存
  } catch {
    /* 读不到就当默认的「对话」 */
  }
  return "对话"
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
  成员们: 集群成员[]
  派活: (任务: string) => void
  清空对话: () => void
  导出对话: () => Promise<string>
  忙: boolean
}) {
  const { 消息们, 追加, 改条, 补条, 项目, 章节号, 标题, 正文, 设定, 看板 } = 属性
  const [模式, set模式值] = useState<模式>(读模式)
  const [模型, set模型] = useState("")
  const [自定义模型, set自定义模型] = useState("")
  const [输入, set输入] = useState("")
  const [对话中, set对话中] = useState(false)
  const [讨论中, set讨论中] = useState(false)
  const [错误, set错误] = useState("")
  const [提示, set提示] = useState("")
  const [摘要, set摘要] = useState("")
  const [已压条数, set已压条数] = useState(0)
  const [开写包, set开写包] = useState<string | null>(null)
  const [计划状态, set计划状态] = useState("")
  const 当前请求 = useRef("")
  const 底 = useRef<HTMLDivElement | null>(null)
  /** 讨论里每个成员一个请求号，说完就 resolve；说过的内容也存在这里，供总编收口。 */
  const 讨论等待 = useRef(new Map<string, () => void>())
  const 讨论文本 = useRef(new Map<string, string>())

  const 分工 = 设定?.模型.分工
  const 模型们 = Array.from(new Set([分工?.总编, 分工?.执笔, 分工?.审校, 分工?.助手].filter(Boolean) as string[]))
  const 实际模型 = 模型 === "__自定义" ? 自定义模型.trim() : 模型 || (分工?.助手 ?? "")
  const 忙 = 属性.忙 || 对话中 || 讨论中

  useEffect(() => {
    set模型((旧) => 旧 || (分工?.助手 ?? ""))
  }, [分工?.助手])

  useEffect(() => {
    底.current?.scrollTo({ top: 底.current.scrollHeight, behavior: "smooth" })
  }, [消息们])

  // 清空对话时把压缩记忆一起清掉，免得新对话背着旧摘要。
  useEffect(() => {
    if (消息们.length === 0) {
      set摘要("")
      set已压条数(0)
    }
  }, [消息们.length])

  // 计划模式：进模式或换章时读一次开写包（只读，不改文件）。
  useEffect(() => {
    if (模式 !== "计划" || 章节号 === null) return
    let 还有效 = true
    const 相对 = 计划.开写包 + "/第" + String(章节号).padStart(3, "0") + "章 开写包.md"
    set计划状态("正在读开写包…")
    void (async () => {
      try {
        const 内容 = await 桥.书库读文件(相对)
        if (!还有效) return
        set开写包(内容.是文本 ? 内容.文本 : null)
        set计划状态("")
      } catch {
        if (!还有效) return
        set开写包(null)
        set计划状态("这一章还没有开写包；派一次活就会生成。")
      }
    })()
    return () => {
      还有效 = false
    }
  }, [模式, 章节号])

  useEffect(() => {
    const 卸载 = 桥.监听对话((事件: 对话事件) => {
      // 讨论：每个成员一个请求号，各自落到自己的气泡里
      const 等 = 讨论等待.current.get(事件.请求号)
      if (等) {
        const 回条 = 事件.请求号 + "-回"
        if (事件.类型 === "正文") {
          改条(回条, 事件.文本)
          讨论文本.current.set(事件.请求号, (讨论文本.current.get(事件.请求号) ?? "") + 事件.文本)
        } else if (事件.类型 === "用量") {
          try {
            补条(回条, { 用量: JSON.parse(事件.文本) as 用量 })
          } catch {
            /* 用量块不规范就当没有 */
          }
        } else if (事件.类型 === "结束") {
          补条(回条, { 进行中: false })
          讨论等待.current.delete(事件.请求号)
          等()
        } else if (事件.类型 === "错误") {
          改条(回条, "\n[出错] " + 事件.文本)
          补条(回条, { 进行中: false, 出错: true })
          讨论等待.current.delete(事件.请求号)
          等()
        }
        return
      }

      // 普通对话
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

  const 切模式 = (新: 模式) => {
    set模式值(新)
    set错误("")
    try {
      localStorage.setItem(模式键, 新)
    } catch {
      /* 存不下不影响本回合 */
    }
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

  /** 一对一对话：带摘要压缩的完整上下文。 */
  const 发对话 = async (文本: string) => {
    const 干净 = 文本.trim()
    if (!干净 || 对话中) return
    const 请求号 = String(Date.now()) + Math.random().toString(16).slice(2)
    当前请求.current = 请求号

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

  /** 讨论阵容：除总编外按固定角色顺序取几位，总编留给收口。 */
  const 讨论阵容 = (): 集群成员[] => {
    const 序 = ["审校", "伏笔", "台账", "地点", "物品"]
    const 们 = 序.map((角) => 属性.成员们.find((人) => 人.角色 === 角)).filter(Boolean) as 集群成员[]
    const 上限 = Math.max(1, Math.min(4, 设定?.智能体.阵容上限 ?? 4) - 1)
    return 们.slice(0, 上限)
  }

  const 模型给 = (角色: string): string => {
    if (!分工) return 实际模型
    if (角色 === "总编") return 分工.总编
    if (角色 === "审校") return 分工.审校
    return 分工.助手
  }

  /** 一位成员发言：独立请求号、独立气泡，流式收字，说完就 resolve。 */
  const 跑一员 = (成员: 集群成员, 议题: string, 前话: string): Promise<string> =>
    new Promise((解决) => {
      const 请求号 = "讨-" + Date.now() + "#" + 成员.名称 + Math.random().toString(16).slice(2, 5)
      讨论等待.current.set(请求号, () => 解决(讨论文本.current.get(请求号) ?? ""))
      讨论文本.current.set(请求号, "")
      追加({ id: 请求号 + "-回", 谁: "集群", 文本: "", 进行中: true })
      const 系统提示 = [
        成员.人格,
        "",
        "【讨论规则】",
        "1. 只就议题说 2–3 句，给出你的判断与依据。",
        "2. 不写正文、不复述别人的话、不做总结。",
        "3. 拿不准就明说「未定」，不要编。",
      ].join("\n")
      const 用户输入 = 前话
        ? "【议题】" + 议题 + "\n\n【前面几位说过的，只作参考，不要复述】\n" + 前话
        : "【议题】" + 议题
      void 桥.发送对话({ 请求号, 模型: 模型给(成员.角色), 系统提示, 用户输入 }).catch(() => {
        讨论等待.current.delete(请求号)
        补条(请求号 + "-回", { 文本: "（这一位没接上话）", 进行中: false, 出错: true })
        解决("")
      })
    })

  /** 总编收口：把刚才的讨论收成几条可执行结论。 */
  const 收口 = (议题: string, 讨论文: string, 请求号: string): Promise<void> =>
    new Promise((解决) => {
      讨论等待.current.set(请求号, 解决)
      讨论文本.current.set(请求号, "")
      追加({ id: 请求号 + "-回", 谁: "总编", 文本: "", 进行中: true })
      const 人格 = (设定?.智能体.人格.总编 ?? "").split("{书名}").join(项目?.书名 ?? "这本书")
      const 系统提示 = [
        人格,
        "",
        "【收口】",
        "把上面的讨论收成 3 条可执行结论，每条一行；有分歧就写明分歧。",
        "不要复述过程，不写正文。",
      ].join("\n")
      void 桥
        .发送对话({ 请求号, 模型: 模型给("总编"), 系统提示, 用户输入: "【议题】" + 议题 + "\n\n【讨论记录】\n" + 讨论文 })
        .catch(() => {
          讨论等待.current.delete(请求号)
          补条(请求号 + "-回", { 文本: "（总编没接上话）", 进行中: false, 出错: true })
          解决()
        })
    })

  /** 讨论：议题发下去，成员一个一个接着说（逐个流式出现），最后总编收口。 */
  const 开讨论 = async (议题: string) => {
    const 干净 = 议题.trim()
    if (!干净 || 讨论中) return
    const 阵容 = 讨论阵容()
    if (阵容.length === 0) {
      set错误("还没有可发言的成员，先在设置里建一个")
      return
    }
    set讨论中(true)
    set错误("")
    set输入("")
    追加({ id: "议题-" + Date.now(), 谁: "你", 文本: "（讨论）" + 干净 })
    let 前话 = ""
    for (const 成员 of 阵容) {
      const 刚说 = await 跑一员(成员, 干净, 前话)
      前话 += "【" + 成员.名称 + "】" + 刚说.trim() + "\n"
    }
    const 收口号 = "收-" + Date.now() + Math.random().toString(16).slice(2, 5)
    await 收口(干净, 前话, 收口号)
    set讨论中(false)
  }

  const 发送 = () => {
    if (忙) return
    const 文本 = 输入.trim()
    if (模式 === "对话") void 发对话(文本)
    else if (模式 === "讨论") void 开讨论(文本)
  }

  const 停止 = async () => {
    for (const 号 of [...讨论等待.current.keys()]) {
      await 桥.中止对话(号)
      讨论等待.current.delete(号)
    }
    if (当前请求.current && 对话中) await 桥.中止对话(当前请求.current)
    set对话中(false)
    set讨论中(false)
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
    } catch (错: any) {
      set提示("导出失败：" + String(错?.message ?? 错))
    }
  }

  /** 讨论气泡上的说话人：请求号里写着「#成员名」。 */
  const 气泡名 = (条: 对话条目): string => {
    const 匹配 = /#([^-]+?)[0-9a-f]{0,4}-回$/.exec(条.id)
    return 匹配 ? 匹配[1] : 条.谁
  }

  const 待裁定条目 = (看板?.待裁定 ?? []).find((项) => 项.章号 === (章节号 ?? 0))?.条目 ?? []
  const 该兑 = (看板?.伏笔 ?? []).filter(
    (项) => 项.状态 !== "已兑现" && (项.超期 || 项.久置 || 项.预定章.includes(章节号 ?? 0)),
  )

  return (
    <div className="对话区">
      <div className="分段 对话分段">
        {模式们.map((名) => (
          <button
            key={名}
            className={"分段按钮" + (模式 === 名 ? " 选中" : "")}
            onClick={() => 切模式(名)}
            title={"切到「" + 名 + "」"}
          >
            <图标 名={模式图标[名]} 大小={15} />
            {名}
          </button>
        ))}
        <div className="对话分段右">
          <button className="小按钮 图标按钮" onClick={属性.清空对话} title="清空对话">
            <图标 名="清空" 大小={15} />
          </button>
          <button className="小按钮 图标按钮" onClick={导出} title="导出对话为 Markdown">
            <图标 名="下载" 大小={15} />
          </button>
        </div>
      </div>

      {模式 !== "计划" ? (
        <div className="对话副行">
          <span className="图标-芯片" title="模型">
            <图标 名="芯片" 大小={14} />
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
        </div>
      ) : null}

      {提示 ? <div className="对话提示 微信息">{提示}</div> : null}

      {模式 === "计划" ? (
        <>
          <div className="计划区">
            <div className="分组条">
              <span>开写包 · 第 {章节号 ?? "—"} 章</span>
              <span>只读</span>
            </div>
            {开写包 ? (
              <div className="计划卡">
                <div className="计划正文">{开写包}</div>
              </div>
            ) : (
              <div className="计划空">{计划状态 || "这一章还没有开写包"}</div>
            )}

            <div className="分组条">
              <span>待裁定建议</span>
              <span>{待裁定条目.length} 条</span>
            </div>
            {待裁定条目.length === 0 ? <div className="计划空">这一章没有待裁定建议</div> : null}
            {待裁定条目.map((条, 序) => (
              <div className="伏笔项" key={序}>
                <div className="伏笔头">
                  <span className="伏笔号">{序 + 1}</span>
                  <span className="伏笔名">{条.内容}</span>
                </div>
                <div className="伏笔尾">
                  {条.提者}（{条.角色}）· 依据：{条.依据 || "未写明"}
                </div>
              </div>
            ))}

            <div className="分组条">
              <span>本章该兑伏笔</span>
              <span>{该兑.length} 条</span>
            </div>
            {该兑.length === 0 ? <div className="计划空">没有到期的伏笔</div> : null}
            {该兑.map((项) => (
              <div className={"伏笔项" + (项.超期 ? " 超期" : "")} key={项.编号}>
                <div className="伏笔头">
                  <span className="伏笔号">{项.编号}</span>
                  <span className="伏笔名">{项.名称}</span>
                  <span className={"徽 " + (项.超期 ? "超期" : "")}>{项.超期 ? "超期" : 项.久置 ? "久置" : 项.状态}</span>
                </div>
                <div className="伏笔尾">
                  埋于 {项.埋章 === null ? "—" : "ch" + 项.埋章}　搁置 {项.搁置章数} 章
                  {项.参考间隔 !== null ? "　参考间隔 " + 项.参考间隔 + " 章" : ""}
                </div>
              </div>
            ))}
          </div>
          <div className="计划底">
            <button
              onClick={() => {
                if (章节号 === null) return
                属性.派活("重新生成第 " + 章节号 + " 章的开写包：给出本章目标、必须兑现的伏笔、不能写的东西、谁在场。")
              }}
              disabled={属性.忙 || 章节号 === null}
              title="派一次活，重新生成这一章的开写包"
            >
              <图标 名="播放" 大小={14} />
              重新生成
            </button>
            <span className="微信息">会调一次集群；结果落在「计划/开写包」和右侧对话里。</span>
          </div>
        </>
      ) : (
        <>
          <div className="流" ref={底}>
            {已压条数 > 0 ? (
              <div className="对话提示 微信息" title="较早的消息已用助手模型压成摘要，随每次提问一起带上">
                较早 {已压条数} 条已压缩
              </div>
            ) : null}
            {消息们.length === 0 ? (
              <div className="空态" style={{ padding: 24 }}>
                直接说要什么；想听争论就切到「讨论」。
              </div>
            ) : null}
            {消息们.map((条) => (
              <div key={条.id} className={"消息 谁-" + 条.谁}>
                <div className="气泡">
                  <div className="气泡头">
                    <图标 名={说话人图标[条.谁]} 大小={14} />
                    <span className="气泡名">{气泡名(条)}</span>
                    {条.时间 ? <span className="微信息">{时刻(条.时间)}</span> : null}
                    {条.进行中 ? <span className="微信息">正在说话…</span> : null}
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
                      {!条.出错 && !条.进行中 && !条.被替代 && 条.谁 === "总编" && 原问(条) ? (
                        <button className="小按钮 图标按钮" onClick={() => void 重跑(条)} title="重新生成（旧回答标注为已替代）">
                          <图标 名="刷新" 大小={14} />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <div className="消息体">{条.文本}</div>
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
                  {(条.谁 === "总编" || Boolean(条.用量)) && !条.进行中 ? (
                    <div className="用量行">{用量摘要(条.用量)}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="输入区">
            <textarea
              className="输入框"
              placeholder={占位[模式]}
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
              <span className="微信息">
                {模式 === "讨论"
                  ? 讨论中
                    ? "讨论进行中：成员一个个接着说…"
                    : "议题会依次交给 " + 讨论阵容().map((人) => 人.名称).join("、") + "，最后由总编收口"
                  : "Enter 发送 · Shift+Enter 换行"}
              </span>
              <div className="操作右">
                <button onClick={发送} disabled={忙 || !输入.trim()} title="发送（Enter）">
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
        </>
      )}
      {错误 ? <div className="微信息" style={{ color: "var(--危)", padding: "0 12px 10px" }}>出错：{错误}</div> : null}
    </div>
  )
}
