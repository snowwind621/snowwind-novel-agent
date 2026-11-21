// 只负责一件事：右侧对话栏——对话 / 讨论 / 计划三种模式，气泡、计划卡、提问卡、流式收字。
import React, { useEffect, useRef, useState } from "react"
import { 桥 } from "./接口"
import type { 看板数据, 设置, 项目摘要, 集群成员, 对话事件, 对话条目, 工具回执, 用量 } from "./接口"
import { 组装系统提示 } from "../05 编排内核/章节提示词"
import { 该压缩, 取要压的, 造摘要提示, 拼用户输入, 估算词元, 续摘要, 取摘要模型 } from "../06 智能体运行时/对话压缩"
import type { 对话条 } from "../06 智能体运行时/对话压缩"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"
import "./对话样式.css"

type 模式 = "对话" | "讨论" | "计划"

const 模式们: 模式[] = ["对话", "讨论", "计划"]
const 模式图标: Record<模式, 图标名> = { 对话: "笔", 讨论: "用户群", 计划: "灯泡" }
const 模式键 = "对话模式"

/** 三种模式是同一个总控的三种姿态，不是三个功能。 */
const 占位: Record<模式, string> = {
  对话: "直接说你要什么。Enter 发送，Shift+Enter 换行。",
  讨论: "把要讨论的事说出来，我不动文件，只和你把后续想清楚。",
  计划: "说清楚要做什么，我先出计划表，你确认了我再动手。",
}
const 发送字样: Record<模式, string> = { 对话: "发送", 讨论: "讨论", 计划: "出计划" }
const 空态字: Record<模式, string> = {
  对话: "直接说你要什么",
  讨论: "把要讨论的事说出来，我不动文件，只和你把后续想清楚",
  计划: "说清楚要做什么，我先出计划表，你确认了我再动手",
}

/** 只留图标区分：你的靠右、助手的靠左，不再写「你 / 总编 / 系统」这些字。 */
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

/** 工具回执 → 一行摘要（不带任何 emoji，图标另外画） */
function 工具说明(回: 工具回执): string {
  const 对 = 回.参数 && typeof 回.参数 === "object" ? Object.entries(回.参数).slice(0, 3) : []
  const 参数 = 对.map(([键, 值]) => 键 + ":" + (typeof 值 === "string" ? "\u201c" + 值 + "\u201d" : String(值))).join(", ")
  const 尾 =
    回.状态 === "完成"
      ? "完成" + (typeof 回.结果字数 === "number" ? "，" + 回.结果字数 + " 字" : "")
      : 回.状态 === "待确认"
        ? "等你回一句「确认」"
        : 回.状态
  return (回.中文名 || 回.名称) + (参数 ? "（{" + 参数 + "}）" : "") + " → " + 尾 + (回.摘要 ? "：" + 回.摘要 : "")
}

function 千分(数: number): string {
  return 数.toLocaleString("zh-CN")
}

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

/** 连续同一个人的消息合成一组：图标只出一次，中间留白收紧。 */
interface 消息组 {
  谁: 对话条目["谁"]
  名: string
  条们: 对话条目[]
}

function 归组(消息们: 对话条目[]): 消息组[] {
  const 组们: 消息组[] = []
  for (const 条 of 消息们) {
    const 名 = 气泡名(条)
    const 尾 = 组们[组们.length - 1]
    if (尾 && 尾.谁 === 条.谁 && 尾.名 === 名 && !条.计划 && !条.提问) 尾.条们.push(条)
    else 组们.push({ 谁: 条.谁, 名, 条们: [条] })
  }
  return 组们
}

/** 讨论里成员的名字写在请求号里；其它情况返回「谁」本身。 */
function 气泡名(条: 对话条目): string {
  const 匹配 = /#([^-]+?)[0-9a-f]{0,4}-回$/.exec(条.id)
  return 匹配 ? 匹配[1] : 条.谁
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
  /** 提问卡里「自己写一句」的草稿，按气泡 id 存 */
  const [自定义答, set自定义答] = useState<Record<string, string>>({})
  const [摘要, set摘要] = useState("")
  const [已压条数, set已压条数] = useState(0)
  const 当前请求 = useRef("")
  const 底 = useRef<HTMLDivElement | null>(null)
  const 描述号 = useRef(0)
  const 讨论等待 = useRef(new Map<string, () => void>())
  const 讨论文本 = useRef(new Map<string, string>())
  const 工具已见 = useRef(new Set<string>())
  /** 思考是流式一段段来的：补条只吃补丁，所以这里攒一份再整段写进去 */
  const 思考缓存 = useRef(new Map<string, string>())

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

  useEffect(() => {
    if (消息们.length === 0) {
      set摘要("")
      set已压条数(0)
    }
  }, [消息们.length])

  useEffect(() => {
    const 卸载 = 桥.监听对话((事件: 对话事件) => {
      // 计划表 / 问题：各自落一条卡片气泡（不合并，因为要保留每张卡）
      if (事件.类型 === "计划" || 事件.类型 === "提问") {
        let 数据: any = null
        try {
          数据 = JSON.parse(事件.文本)
        } catch {
          return
        }
        if (!数据) return
        描述号.current += 1
        const id = "卡-" + 事件.请求号 + "-" + 描述号.current
        if (事件.类型 === "计划") {
          追加({ id, 谁: "总编", 文本: 数据.标题 || "计划", 计划: { 路径: String(数据.路径 ?? ""), 标题: String(数据.标题 ?? ""), 步骤: Array.isArray(数据.步骤) ? 数据.步骤 : [] } })
        } else {
          追加({ id, 谁: "总编", 文本: String(数据.问题 ?? ""), 提问: { 问题: String(数据.问题 ?? ""), 选项: Array.isArray(数据.选项) ? 数据.选项.map(String) : undefined } })
        }
        return
      }

      // 工具回执：开始 / 完成 / 失败 / 待确认，合并进同一条「系统」气泡
      if (事件.类型 === "工具") {
        let 回: 工具回执 | null = null
        try {
          回 = JSON.parse(事件.文本) as 工具回执
        } catch {
          return
        }
        if (!回 || !回.名称) return
        const id = "工具-" + (回.轮次 ?? 0) + "-" + 回.名称
        const 补丁 = { 文本: 工具说明(回), 工具: 回, 进行中: 回.状态 === "开始" }
        if (工具已见.current.has(id)) 补条(id, 补丁)
        else {
          工具已见.current.add(id)
          追加({ id, 谁: "系统", ...补丁 })
        }
        return
      }

      const 等 = 讨论等待.current.get(事件.请求号)
      if (等) {
        const 回条 = 事件.请求号 + "-回"
        if (事件.类型 === "正文") {
          改条(回条, 事件.文本)
          讨论文本.current.set(事件.请求号, (讨论文本.current.get(事件.请求号) ?? "") + 事件.文本)
        } else if (事件.类型 === "思考") {
          const 旧 = 思考缓存.current.get(回条) ?? ""
          思考缓存.current.set(回条, 旧 + 事件.文本)
          补条(回条, { 思考: 旧 + 事件.文本 })
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

      if (事件.请求号 !== 当前请求.current) return
      const 回条 = 事件.请求号 + "-回"
      if (事件.类型 === "正文") 改条(回条, 事件.文本)
      else if (事件.类型 === "思考") {
        const 旧 = 思考缓存.current.get(回条) ?? ""
        思考缓存.current.set(回条, 旧 + 事件.文本)
        补条(回条, { 思考: 旧 + 事件.文本 })
      } else if (事件.类型 === "结束") {
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
          /* 网关给的用量块不规范，就当没有 */
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
      void 桥.发送对话({ 请求号, 模型: 取摘要模型(设定), 系统提示: 提示.系统提示, 用户输入: 提示.用户输入, 温度: 0 }).catch(() => {
        卸载()
        解决("")
      })
    })

  /** 发一条：把当前模式一起带过去，服务端据此决定动不动文件。 */
  const 发 = async (文本: string) => {
    const 干净 = 文本.trim()
    if (!干净 || 对话中) return
    const 本轮模式 = 模式
    const 请求号 = String(Date.now()) + Math.random().toString(16).slice(2)
    当前请求.current = 请求号

    const 历史: 对话条[] = 消息们
      .filter((条) => 条.文本.trim() && !条.进行中 && !条.出错 && 条.谁 !== "系统" && !条.计划 && !条.提问)
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
    const 请求 = { 请求号, 模型: 实际模型, 系统提示, 用户输入: 拼用户输入(摘要文, 历史.slice(已压), 干净), 模式: 本轮模式 }
    await 桥.发送对话(请求)
  }

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
        "2. 不写正文、不复述别人的话、不做总结，也不要动任何文件。",
        "3. 拿不准就明说「未定」，不要编。",
      ].join("\n")
      const 用户输入 = 前话
        ? "【议题】" + 议题 + "\n\n【前面几位说过的，只作参考，不要复述】\n" + 前话
        : "【议题】" + 议题
      void 桥.发送对话({ 请求号, 模型: 模型给(成员.角色), 系统提示, 用户输入, 模式: "讨论" }).catch(() => {
        讨论等待.current.delete(请求号)
        补条(请求号 + "-回", { 文本: "（这一位没接上话）", 进行中: false, 出错: true })
        解决("")
      })
    })

  const 收口 = (议题: string, 讨论文: string, 请求号: string): Promise<void> =>
    new Promise((解决) => {
      讨论等待.current.set(请求号, 解决)
      讨论文本.current.set(请求号, "")
      追加({ id: 请求号 + "-回", 谁: "总编", 文本: "", 进行中: true })
      const 人格 = (设定?.智能体.人格.总编 ?? "").split("{书名}").join(项目?.书名 ?? "这本书")
      const 系统提示 = [人格, "", "【收口】", "把上面的讨论收成 3 条可执行结论，每条一行；有分歧就写明分歧。", "不要复述过程，不写正文，不动文件。"].join("\n")
      void 桥.发送对话({ 请求号, 模型: 模型给("总编"), 系统提示, 用户输入: "【议题】" + 议题 + "\n\n【讨论记录】\n" + 讨论文, 模式: "讨论" }).catch(() => {
        讨论等待.current.delete(请求号)
        补条(请求号 + "-回", { 文本: "（总编没接上话）", 进行中: false, 出错: true })
        解决()
      })
    })

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
    追加({ id: "议题-" + Date.now(), 谁: "你", 文本: 干净 })
    let 前话 = ""
    for (const 成员 of 阵容) {
      const 刚说 = await 跑一员(成员, 干净, 前话)
      前话 += "【" + 成员.名称 + "】" + 刚说.trim() + "\n"
    }
    await 收口(干净, 前话, "收-" + Date.now() + Math.random().toString(16).slice(2, 5))
    set讨论中(false)
  }

  const 发送 = () => {
    if (忙) return
    const 文本 = 输入.trim()
    if (!文本) return
    if (模式 === "讨论") void 开讨论(文本)
    else void 发(文本)
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
    await 发(问)
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

  const 组们 = 归组(消息们)

  const 画内容 = (条: 对话条目) => {
    if (条.计划) {
      return (
        <div className="计划卡">
          <div className="计划卡头">
            <span className="计划卡名">{条.计划.标题 || "计划表"}</span>
            {条.计划.路径 ? <span className="计划卡路">{条.计划.路径}</span> : null}
          </div>
          <table className="计划步表">
            <thead>
              <tr>
                <th>#</th>
                <th>动作</th>
                <th>目标文件</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {(条.计划.步骤 ?? []).map((步, 序) => (
                <tr key={序}>
                  <td>{序 + 1}</td>
                  <td>{步.动作}</td>
                  <td className="计划文件">{步.目标文件}</td>
                  <td>{步.说明}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="计划卡脚">
            <button onClick={() => void 发("确认")} title="告诉总控：就按这个做">
              <图标 名="勾" 大小={14} />
              确认执行
            </button>
            <button className="小按钮" onClick={() => void 发("先不做")} title="告诉总控：这次先不动">
              先不做
            </button>
          </div>
        </div>
      )
    }
    if (条.提问) {
      const 已答 = 条.提问答 ?? ""
      const 选项们 = Array.isArray(条.提问.选项) ? 条.提问.选项 : []
      return (
        <div className={"提问卡" + (已答 ? " 已答" : "")}>
          <div className="提问卡头">
            <图标 名="灯泡" 大小={15} />
            <span>总控需要你决定</span>
            {已答 ? <span className="提问已答">已答（选了「{已答}」）</span> : null}
          </div>
          <div className="提问问题">{条.提问.问题}</div>
          {条.提问.建议 ? <div className="提问建议">建议：{条.提问.建议}</div> : null}
          {选项们.length > 0 ? (
            <div className="提问选项">
              {选项们.map((项) => (
                <button
                  key={项}
                  disabled={Boolean(已答)}
                  onClick={() => {
                    补条(条.id, { 提问答: 项 })
                    void 发(项)
                  }}
                  title={已答 ? "这张卡已经答过了" : "回一句：" + 项}
                >
                  {项}
                </button>
              ))}
            </div>
          ) : null}
          {已答 ? null : (
            <div className="提问自答">
              <input
                className="工具输入"
                placeholder="或者自己写一句…"
                value={自定义答[条.id] ?? ""}
                onChange={(事件) => set自定义答((旧) => ({ ...旧, [条.id]: 事件.target.value }))}
                onKeyDown={(事件) => {
                  if (事件.key !== "Enter") return
                  const 文 = (自定义答[条.id] ?? "").trim()
                  if (!文) return
                  补条(条.id, { 提问答: 文 })
                  void 发(文)
                }}
              />
              <button
                className="小按钮"
                disabled={!(自定义答[条.id] ?? "").trim()}
                onClick={() => {
                  const 文 = (自定义答[条.id] ?? "").trim()
                  if (!文) return
                  补条(条.id, { 提问答: 文 })
                  void 发(文)
                }}
              >
                用这句回答
              </button>
            </div>
          )}
        </div>
      )
    }
    if (条.工具) {
      const 类 = 条.工具.状态 === "待确认" ? " 待确认" : 条.工具.状态 === "失败" ? " 失败" : 条.工具.状态 === "完成" ? " 完成" : ""
      return (
        <details className={"工具块" + 类}>
          <summary className="折叠头">
            <图标 名="播放" 大小={14} />
            <span className="折叠题">工具 · {条.文本}</span>
          </summary>
          <div className="折叠体">
            <div className="折叠行">状态：{条.工具.状态}（第 {条.工具.轮次 ?? 1} 轮）</div>
            {条.工具.参数 && Object.keys(条.工具.参数).length > 0 ? (
              <div className="折叠行">参数：{JSON.stringify(条.工具.参数)}</div>
            ) : null}
            {typeof 条.工具.结果字数 === "number" ? <div className="折叠行">结果字数：{条.工具.结果字数}</div> : null}
            {条.工具.摘要 ? <div className="折叠行">摘要：{条.工具.摘要}</div> : null}
          </div>
        </details>
      )
    }
    return (
      <>
        {条.思考 ? (
          <details className="思考块">
            <summary className="折叠头">
              <图标 名="笔" 大小={14} />
              <span className="折叠题">思考 · {条.思考.replace(/\s/g, "").length} 字</span>
            </summary>
            <div className="折叠体 思考文">{条.思考}</div>
          </details>
        ) : null}
        {条.文本 ? <div className="消息体">{条.文本}</div> : null}
      </>
    )
  }

  return (
    <div className="对话区">
      <div className="分段 对话分段">
        {模式们.map((名) => (
          <button
            key={名}
            className={"分段按钮" + (模式 === 名 ? " 选中" : "")}
            onClick={() => 切模式(名)}
            title={"总控切到「" + 名 + "」：" + 空态字[名]}
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
          <input className="工具输入" placeholder="模型名" value={自定义模型} onChange={(事件) => set自定义模型(事件.target.value)} />
        ) : null}
        <span className="胶囊">{章节号 ? "ch" + 章节号 : "无章节"}</span>
        <span className="用量累计" title="本轮所有回答的用量合计">
          {累计摘要(消息们)}
        </span>
      </div>

      {提示 ? <div className="对话提示 微信息">{提示}</div> : null}

      <div className="流" ref={底}>
        {已压条数 > 0 ? <div className="对话提示 微信息">较早 {已压条数} 条已压缩</div> : null}
        {消息们.length === 0 ? <div className="空态" style={{ padding: 24 }}>{空态字[模式]}</div> : null}
        {组们.map((组, 组序) => {
          const 我的 = 组.谁 === "你"
          const 显示名 = 组.名 !== 组.谁 ? 组.名 : ""
          return (
            <div key={组序} className={"消息组" + (我的 ? " 我" : " 它")}>
              <div className="组图标" title={显示名 || 组.谁}>
                <图标 名={说话人图标[组.谁]} 大小={15} />
              </div>
              <div className="组体">
                {显示名 ? <div className="组名">{显示名}</div> : null}
                {组.条们.map((条) => (
                  <div key={条.id} className={"气泡" + (条.出错 ? " 出错" : "")}>
                    {画内容(条)}
                    <div className="气泡脚">
                      {条.进行中 ? <span className="微信息">正在说话…</span> : null}
                      {条.被替代 ? <span className="微信息">已被新版替代</span> : null}
                      <span className="消息操作">
                        <button className="小按钮 图标按钮" onClick={() => void 复制(条)} title="复制这条">
                          <图标 名="复制" 大小={14} />
                        </button>
                        {条.出错 || (!条.进行中 && !条.被替代 && 条.谁 === "总编" && 原问(条)) ? (
                          <button className="小按钮 图标按钮" onClick={() => void 重跑(条)} title={条.出错 ? "重试这一条" : "重新生成"}>
                            <图标 名="刷新" 大小={14} />
                          </button>
                        ) : null}
                      </span>
                      {条.用量 ? <span className="用量行">{用量摘要(条.用量)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
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
              : 模式 === "计划"
                ? "先出计划表，你确认了我再动手"
                : "Enter 发送 · Shift+Enter 换行"}
          </span>
          <div className="操作右">
            <button onClick={发送} disabled={忙 || !输入.trim()} title={发送字样[模式] + "（Enter）"}>
              <图标 名={模式 === "计划" ? "灯泡" : "发送"} 大小={15} />
              {发送字样[模式]}
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
