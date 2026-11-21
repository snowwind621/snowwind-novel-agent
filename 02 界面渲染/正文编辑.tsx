// 只负责一件事：中栏编辑器——标签页、不可编辑的标题块、富文本正文、自动保存、撤回重做。
import React, { useEffect, useRef, useState } from "react"
import { 渲染Markdown, 取回Markdown } from "./编辑器渲染"
import "./编辑器样式.css"
import { 桥, 时刻 } from "./接口"
import type { 自动同步状态, 自动同步上次 } from "./接口"
import { 视图切换 } from "./视觉总览"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"

export interface 编辑器标签 {
  id: string
  标题: string
  种类: "章" | "文件"
}

interface 改后 {
  文: string
  起: number
  止: number
}

/** 有选中就两边包起来；没选中就插一对符号，光标落在中间。 */
function 包裹(正文: string, 起: number, 止: number, 左: string, 右: string): 改后 {
  const 选中 = 正文.slice(起, 止)
  return {
    文: 正文.slice(0, 起) + 左 + 选中 + 右 + 正文.slice(止),
    起: 起 + 左.length,
    止: 起 + 左.length + 选中.length,
  }
}

/** 行级前缀：每行都带这个前缀时再点一次就是整段取消。 */
function 行前缀(正文: string, 起: number, 止: number, 造前缀: (序: number) => string, 已有: RegExp): 改后 {
  const 行首 = 正文.lastIndexOf("\n", Math.max(0, 起 - 1)) + 1
  const 换行位 = 正文.indexOf("\n", 止)
  const 行尾 = 换行位 < 0 ? 正文.length : 换行位
  const 行们 = 正文.slice(行首, 行尾).split("\n")
  const 全都有 = 行们.every((行) => 已有.test(行))
  const 新行们 = 行们.map((行, 序) => {
    const 干净 = 行.replace(已有, "")
    return 全都有 ? 干净 : 造前缀(序) + 干净
  })
  const 新段 = 新行们.join("\n")
  return { 文: 正文.slice(0, 行首) + 新段 + 正文.slice(行尾), 起: 行首, 止: 行首 + 新段.length }
}

/** 分割线是块级语法：保证它独占一行。 */
function 插分割线(正文: string, 起: number, 止: number): 改后 {
  const 前 = 正文.slice(0, 起)
  const 后 = 正文.slice(止)
  const 左 = 前 === "" || 前.endsWith("\n") ? "" : "\n"
  const 右 = 后.startsWith("\n") || 后 === "" ? "" : "\n"
  const 插入 = 左 + "---" + 右
  const 位置 = 起 + 插入.length
  return { 文: 前 + 插入 + 后, 起: 位置, 止: 位置 }
}

const 工具按钮们: Array<{ 名: string; 说明: string; 图标: 图标名; 做: (文: string, 起: number, 止: number) => 改后 }> = [
  { 名: "粗体", 说明: "粗体：**文字**", 图标: "粗体", 做: (文, 起, 止) => 包裹(文, 起, 止, "**", "**") },
  { 名: "斜体", 说明: "斜体：*文字*", 图标: "斜体", 做: (文, 起, 止) => 包裹(文, 起, 止, "*", "*") },
  { 名: "标题", 说明: "二级标题：## ", 图标: "标题", 做: (文, 起, 止) => 行前缀(文, 起, 止, () => "## ", /^#{1,6}\s+/) },
  { 名: "引用", 说明: "引用：> ", 图标: "引用", 做: (文, 起, 止) => 行前缀(文, 起, 止, () => "> ", /^>\s?/) },
  { 名: "无序", 说明: "无序列表：- ", 图标: "无序列表", 做: (文, 起, 止) => 行前缀(文, 起, 止, () => "- ", /^[-*+]\s+/) },
  { 名: "有序", 说明: "有序列表：1. ", 图标: "有序列表", 做: (文, 起, 止) => 行前缀(文, 起, 止, (序) => 序 + 1 + ". ", /^\d+[.)]\s+/) },
  { 名: "行内代码", 说明: "行内代码：`代码`", 图标: "行内代码", 做: (文, 起, 止) => 包裹(文, 起, 止, "`", "`") },
  { 名: "分割线", 说明: "分割线：---", 图标: "分割线", 做: 插分割线 },
]

/** 撤销栈：按标签各存一份，只存「已提交的改动」。 */
const 栈深兜底 = 100
const 默认提交延迟 = 1200

/** 设置里的「编辑器.撤回栈深度」；越界或没读到就退回兜底值（设置存储已夹在 10~500）。 */
export function 取撤回深度(值?: number): number {
  const 数 = Math.round(Number(值))
  if (!Number.isFinite(数) || 数 < 1) return 栈深兜底
  return Math.min(500, 数)
}

/** 往栈尾压一步；超过深度就从最老的一端丢——「最多只能撤 N 步」就落在这里。 */
export function 裁栈(栈: string[], 深度: number): string[] {
  const 深 = 取撤回深度(深度)
  return 栈.length <= 深 ? 栈 : 栈.slice(栈.length - 深)
}

function 现在是(): string {
  const 日 = new Date()
  return String(日.getHours()).padStart(2, "0") + ":" + String(日.getMinutes()).padStart(2, "0")
}

export function 正文编辑(属性: {
  已开书库: boolean
  标签们: 编辑器标签[]
  当前标签: string
  切标签: (id: string) => void
  关标签: (id: string) => void
  标题: string
  正文: string
  改: (正文: string) => void
  /** 立即=true 表示「现在就提交 Git」（Ctrl+S / 切标签 / 失焦）；自动保存传 false 走节流 */
  保存: (立即?: boolean) => Promise<boolean>
  /** 自动保存防抖毫秒；不传就按 1.2 秒 */
  自动保存毫秒?: number
  提示字?: string
  切总览?: () => void
  /** 当前章号：台账状态只关心这一章 */
  章节号?: number | null
  /** 静置秒（设置里的「台账.静置秒」），只用来写「N 秒后自动跑」 */
  静置秒?: number
  /** 跨台账不一致的条数（0 就显示「一致性 ✓」） */
  不一致数?: number
  /** 点提示跳到数据面板的一致性分类 */
  去一致性?: () => void
}) {
  const { 已开书库, 标签们, 当前标签, 切标签, 关标签, 标题, 正文, 改, 保存, 提示字, 自动保存毫秒 } = 属性
  const 提交延迟 = Math.max(200, 自动保存毫秒 ?? 默认提交延迟)
  const 富 = useRef<HTMLDivElement | null>(null)
  const 合成中 = useRef(false)
  const 上次渲染 = useRef("")
  const 上次标签 = useRef("")
  const 提交计时 = useRef<number | null>(null)
  const 历史表 = useRef(new Map<string, { 栈: string[]; 位: number }>())
  /** 撤回深度：进标签时读一次设置存进 ref，绝不在渲染里读设置文件（每敲一个字都读会把磁盘敲坏） */
  const [撤回深度, set撤回深度] = useState(栈深兜底)
  const 深度引用 = useRef(栈深兜底)
  const [保存状态, set保存状态] = useState("")
  const [可撤回, set可撤回] = useState(false)
  const [可重做, set可重做] = useState(false)
  /** 书库还没进 Git 时，改动没法回滚——在工具行右端提醒并提供一键初始化 */
  const [git状态, setGit状态] = useState<{ 有项目: boolean; 是Git仓库: boolean } | null>(null)
  const [初始化中, set初始化中] = useState(false)
  /** 这一章的台账自动同步状态（轮询 + 推送，两条都走） */
  const [台账, set台账] = useState<自动同步状态 | null>(null)
  const [台账详情开, set台账详情开] = useState(false)
  /** 防抖定时器里拿到的是旧闭包，所以「当前正文 / 保存函数」走 ref，永远读最新值 */
  const 最新正文 = useRef(正文)
  const 最新保存 = useRef(保存)

  useEffect(() => {
    最新正文.current = 正文
  }, [正文])

  useEffect(() => {
    最新保存.current = 保存
  }, [保存])

  const 当前历史 = () => {
    let 记 = 历史表.current.get(当前标签)
    if (!记) {
      记 = { 栈: [正文], 位: 0 }
      历史表.current.set(当前标签, 记)
    }
    return 记
  }

  const 刷新按钮 = () => {
    const 记 = 当前历史()
    set可撤回(记.位 > 0)
    set可重做(记.位 < 记.栈.length - 1)
  }

  useEffect(() => {
    刷新按钮()
  }, [当前标签, 正文])

  // 撤回深度：只在进标签时读一次设置。改完设置切一下标签就生效，旧的超长栈会按新深度砍掉。
  useEffect(() => {
    let 还在 = true
    void 桥
      .读取设置()
      .then((设) => {
        if (!还在) return
        const 深 = 取撤回深度(设?.编辑器?.撤回栈深度)
        深度引用.current = 深
        set撤回深度(深)
        for (const 记 of 历史表.current.values()) {
          if (记.栈.length <= 深) continue
          const 丢 = 记.栈.length - 深
          记.栈 = 记.栈.slice(丢)
          记.位 = Math.max(0, Math.min(记.位 - 丢, 记.栈.length - 1))
        }
        刷新按钮()
      })
      .catch(() => {
        /* 读不到设置就按兜底深度走，不影响写作 */
      })
    return () => {
      还在 = false
    }
  }, [当前标签])

  useEffect(() => {
    void 桥
      .书库Git状态()
      .then((状态) => setGit状态(状态))
      .catch(() => setGit状态(null))
  }, [已开书库])

  // 台账状态：有推送就立刻刷，没推送就 3 秒轮询兜底；只盯当前章。
  useEffect(() => {
    const 章 = 属性.章节号 ?? null
    if (!章) {
      set台账(null)
      return
    }
    let 还有效 = true
    const 拉 = async () => {
      try {
        const 状态 = await 桥.台账自动状态()
        if (还有效) set台账(状态)
      } catch {
        /* 状态拿不到就等下一轮，不打断写作 */
      }
    }
    void 拉()
    const 计时 = window.setInterval(() => void 拉(), 3000)
    const 卸 = 桥.监听自动同步((事件) => {
      if (事件.章号 === 章) void 拉()
    })
    return () => {
      还有效 = false
      window.clearInterval(计时)
      卸()
    }
  }, [属性.章节号])

  const 本章上次: 自动同步上次 | undefined = 属性.章节号 ? 台账?.上次?.[String(属性.章节号)] : undefined
  const 台账在跑 = Boolean(属性.章节号 && (台账?.正在跑 ?? []).includes(属性.章节号))
  const 台账待 = Boolean(属性.章节号 && (台账?.待同步 ?? []).includes(属性.章节号))
  const 台账失败 = Boolean(本章上次 && !本章上次.成功 && !台账在跑)
  const 台账类 = 台账在跑 ? " 跑" : 台账失败 ? " 败" : 台账待 ? " 待" : " 好"
  const 台账字 = !属性.章节号
    ? ""
    : 台账在跑
      ? "台账 ch" + 属性.章节号 + " · 同步中…"
      : 台账失败
        ? "台账 ch" + 属性.章节号 + " · 同步失败：" + (本章上次?.说明 ?? "未知原因")
        : 本章上次
          ? "台账 ch" + 属性.章节号 + " · 已同步 " + 时刻(本章上次.时刻)
          : 台账待
            ? "台账 ch" + 属性.章节号 + " · 待同步（" + (属性.静置秒 ?? 20) + " 秒后自动跑）"
            : "台账 ch" + 属性.章节号 + " · 未同步"
  const 台账明细 = 本章上次
    ? "上次同步：" +
      (本章上次.用时毫秒 ? "用时 " + (本章上次.用时毫秒 / 1000).toFixed(1) + " 秒 · " : "") +
      (本章上次.用量 ? "输入 " + 本章上次.用量.输入 + " / 输出 " + 本章上次.用量.输出 + " token" : "没记用量")
    : ""

  const 台账重试 = async () => {
    const 章 = 属性.章节号
    if (!章) return
    try {
      await 桥.台账立即同步(章)
    } catch {
      /* 失败原因会从状态里读回来 */
    }
    try {
      set台账(await 桥.台账自动状态())
    } catch {
      /* 忽略 */
    }
  }

  const 初始化Git = async () => {
    set初始化中(true)
    try {
      await 桥.初始化书库Git()
      setGit状态(await 桥.书库Git状态())
    } catch {
      /* 初始化失败就维持原样，下一次进来再看 */
    } finally {
      set初始化中(false)
    }
  }

  // 换标签 / 外部改了正文（撤销、重做、续写插入）时把 Markdown 灌进 contenteditable。
  useEffect(() => {
    const 元素 = 富.current
    if (!元素 || 合成中.current) return
    const 换了标签 = 上次标签.current !== 当前标签
    上次标签.current = 当前标签
    // 只有换标签才取消待提交的定时器；普通打字时那一次提交必须留着，否则永远存不上
    if (换了标签 && 提交计时.current !== null) {
      window.clearTimeout(提交计时.current)
      提交计时.current = null
    }
    // 撤销栈的底就是「这次进标签时读到的正文」：换标签就重开一份，避免拿改过的文本当底
    if (换了标签 || !历史表.current.has(当前标签)) {
      历史表.current.set(当前标签, { 栈: [正文], 位: 0 })
      刷新按钮()
    }
    if (!换了标签 && 上次渲染.current === 正文 && 元素.innerHTML !== "") return
    上次渲染.current = 正文
    元素.innerHTML = 渲染Markdown(正文, { 缩进当文字: true }) || "<p><br></p>"
  }, [正文, 当前标签])

  /** 立刻提交一次：压撤销栈 + 存盘。防抖到点、切标签、Ctrl+S 都走它。 */
  const 提交 = async (立即 = false): Promise<boolean> => {
    if (提交计时.current !== null) {
      window.clearTimeout(提交计时.current)
      提交计时.current = null
    }
    if (!当前标签) return false
    const 文 = 最新正文.current
    const 记 = 当前历史()
    if (记.栈[记.位] !== 文) {
      记.栈 = 裁栈([...记.栈.slice(0, 记.位 + 1), 文], 深度引用.current)
      记.位 = 记.栈.length - 1
      刷新按钮()
    }
    set保存状态("保存中…")
    const 成 = await 最新保存.current(立即)
    set保存状态(成 ? "已保存 " + 现在是() : "保存失败")
    return 成
  }

  const 排提交 = () => {
    if (提交计时.current !== null) window.clearTimeout(提交计时.current)
    提交计时.current = window.setTimeout(() => {
      提交计时.current = null
      void 提交()
    }, 提交延迟)
  }

  /** 富文本 → Markdown：DOM 只做显示，落盘的永远是纯文本。 */
  const 同步 = () => {
    const 元素 = 富.current
    if (!元素 || 合成中.current) return
    const 换行 = 正文.includes("\r\n") ? "\r\n" : "\n"
    const 新文 = 取回Markdown(元素, 换行)
    if (新文 === 最新正文.current) return
    上次渲染.current = 新文
    最新正文.current = 新文
    改(新文)
  }

  const 光标偏移 = (): number => {
    const 根 = 富.current
    const 选 = window.getSelection()
    if (!根 || !选 || 选.rangeCount === 0 || !选.anchorNode || !根.contains(选.anchorNode)) return -1
    const 范围 = document.createRange()
    范围.selectNodeContents(根)
    范围.setEnd(选.anchorNode, 选.anchorOffset)
    return 范围.toString().length
  }

  const 放光标 = (偏移: number) => {
    const 根 = 富.current
    if (!根 || 偏移 < 0) return
    const 走 = document.createTreeWalker(根, NodeFilter.SHOW_TEXT)
    let 剩 = 偏移
    let 节点 = 走.nextNode() as Text | null
    while (节点) {
      const 长 = 节点.textContent?.length ?? 0
      if (剩 <= 长) {
        const 范围 = document.createRange()
        范围.setStart(节点, 剩)
        范围.collapse(true)
        const 选 = window.getSelection()
        选?.removeAllRanges()
        选?.addRange(范围)
        根.focus()
        return
      }
      剩 -= 长
      节点 = 走.nextNode() as Text | null
    }
    根.focus()
  }

  const 跳到 = async (新位: number) => {
    const 记 = 当前历史()
    if (新位 < 0 || 新位 > 记.栈.length - 1 || 新位 === 记.位) return
    const 偏移 = 光标偏移()
    记.位 = 新位
    const 文 = 记.栈[记.位]
    上次渲染.current = ""
    最新正文.current = 文
    改(文)
    window.setTimeout(() => 放光标(偏移 >= 0 ? 偏移 : 文.length), 0)
    刷新按钮()
    set保存状态("保存中…")
    const 成 = await 最新保存.current(true)
    set保存状态(成 ? "已保存 " + 现在是() : "保存失败")
  }

  const 撤回 = () => void 跳到(当前历史().位 - 1)
  const 重做 = () => void 跳到(当前历史().位 + 1)

  useEffect(() => {
    const 按键 = (事件: KeyboardEvent) => {
      if (!(事件.ctrlKey || 事件.metaKey)) return
      const 键 = 事件.key.toLowerCase()
      if (键 === "s") {
        事件.preventDefault()
        void 提交()
      } else if (键 === "z") {
        事件.preventDefault()
        if (事件.shiftKey) 重做()
        else 撤回()
      } else if (键 === "y") {
        事件.preventDefault()
        重做()
      }
    }
    window.addEventListener("keydown", 按键)
    return () => window.removeEventListener("keydown", 按键)
  }, [正文, 当前标签, 保存状态])

  /** 回车后浏览器会插一个空段：把上一段的缩进抄过来，中文小说才不用每次手打空格。 */
  const 补首行缩进 = () => {
    const 根 = 富.current
    if (!根 || 合成中.current) return
    const 选 = window.getSelection()
    if (!选 || 选.rangeCount === 0) return
    const 范围 = 选.getRangeAt(0)
    let 块: HTMLElement | null =
      范围.startContainer.nodeType === 1 ? (范围.startContainer as HTMLElement) : 范围.startContainer.parentElement
    while (块 && 块.parentElement !== 根) 块 = 块.parentElement
    if (!块 || (块.textContent ?? "").trim() !== "") return
    const 前 = 块.previousElementSibling as HTMLElement | null
    const 前缀 = /^[\u3000 ]*/.exec(前?.textContent ?? "")?.[0] ?? ""
    if (!前缀) return
    const 文本 = document.createTextNode(前缀)
    范围.insertNode(文本)
    范围.setStartAfter(文本)
    范围.collapse(true)
    选.removeAllRanges()
    选.addRange(范围)
  }

  const 输入 = () => {
    if (合成中.current) return
    补首行缩进()
    同步()
    排提交()
  }

  /** 取光标所在的最外层块（p / h2 / ul / blockquote…）。 */
  const 当前块 = (): HTMLElement | null => {
    const 根 = 富.current
    const 选 = window.getSelection()
    if (!根 || !选 || 选.rangeCount === 0) return null
    let 节点: Node | null = 选.getRangeAt(0).startContainer
    if (节点.nodeType === 3) 节点 = 节点.parentNode
    while (节点 && 节点.parentElement !== 根) 节点 = 节点.parentElement
    return (节点 as HTMLElement | null) ?? null
  }

  const 富行内 = (左: string, 右: string) => {
    const 选 = window.getSelection()
    if (!选 || 选.rangeCount === 0) return
    const 范围 = 选.getRangeAt(0)
    const 选中 = 范围.toString()
    if (!选中) {
      const 文本 = document.createTextNode(左 + 右)
      范围.insertNode(文本)
      const 新 = document.createRange()
      新.setStart(文本, 左.length)
      新.collapse(true)
      选.removeAllRanges()
      选.addRange(新)
      富.current?.focus()
      同步()
      排提交()
      return
    }
    const 模板 = document.createElement("div")
    模板.innerHTML = 渲染Markdown(左 + 选中 + 右)
    const 段 = 模板.firstElementChild
    const 源 = 段 && (段.tagName === "P" || 段.tagName === "DIV") ? 段 : 模板
    const 片段 = document.createDocumentFragment()
    while (源.firstChild) 片段.appendChild(源.firstChild)
    范围.deleteContents()
    范围.insertNode(片段)
    选.collapseToEnd()
    富.current?.focus()
    同步()
    排提交()
  }

  const 换块 = (造: (旧块: HTMLElement) => HTMLElement | null) => {
    const 根 = 富.current
    const 块 = 当前块()
    if (!根 || !块) return
    const 新块 = 造(块)
    if (!新块) return
    块.replaceWith(新块)
    根.focus()
    同步()
    排提交()
  }

  const 富标题 = () =>
    换块((块) => {
      const 新 = document.createElement(块.tagName === "H2" ? "P" : "H2")
      新.innerHTML = 块.innerHTML.replace(/^[\u3000\s]+/, "")
      return 新
    })

  const 富引用 = () =>
    换块((块) => {
      const 内 = document.createElement(块.tagName === "BLOCKQUOTE" ? "P" : "BLOCKQUOTE")
      if (块.tagName === "BLOCKQUOTE") {
        内.innerHTML = 块.innerHTML
        return 内
      }
      内.innerHTML = 块.innerHTML
      const 包 = document.createElement("BLOCKQUOTE")
      const 里 = document.createElement("P")
      里.innerHTML = 块.innerHTML
      包.appendChild(里)
      return 包
    })

  const 富列表 = (有序: boolean) =>
    换块((块) => {
      if (块.tagName === "UL" || 块.tagName === "OL") {
        const 新 = document.createElement("P")
        新.innerHTML = Array.from(块.children)
          .map((项) => (项 as HTMLElement).innerHTML)
          .join("")
        return 新
      }
      const 表 = document.createElement(有序 ? "OL" : "UL")
      const 项 = document.createElement("LI")
      项.innerHTML = 块.innerHTML
      表.appendChild(项)
      return 表
    })

  const 富分割线 = () => {
    const 根 = 富.current
    const 块 = 当前块()
    if (!根 || !块) return
    const 线 = document.createElement("HR")
    const 新段 = document.createElement("P")
    新段.innerHTML = "<br>"
    块.after(线)
    线.after(新段)
    const 选 = window.getSelection()
    const 范围 = document.createRange()
    范围.setStart(新段, 0)
    范围.collapse(true)
    选?.removeAllRanges()
    选?.addRange(范围)
    根.focus()
    同步()
    排提交()
  }

  const 富做 = (名: string) => {
    if (名 === "粗体") return 富行内("**", "**")
    if (名 === "斜体") return 富行内("*", "*")
    if (名 === "行内代码") return 富行内("`", "`")
    if (名 === "标题") return 富标题()
    if (名 === "引用") return 富引用()
    if (名 === "无序") return 富列表(false)
    if (名 === "有序") return 富列表(true)
    if (名 === "分割线") return 富分割线()
  }

  if (标签们.length === 0) {
    return (
      <div className="中栏">
        <div className="标签行">
          <span className="标签空">从左边选一个文件</span>
        </div>
        <div className="编辑器-工具行">
          {属性.切总览 ? (
            <>
              <视图切换 当前="编辑" 切={(视图) => { if (视图 === "全书") 属性.切总览?.() }} />
              <span className="编辑器-分隔" />
            </>
          ) : null}
          <span className="编辑器-提示">{已开书库 ? "左侧点一章或一个 md 文件就会在这里打开。" : "还没有打开书库。"}</span>
        </div>
        <div className="空态">
          {已开书库 ? "从左边选一个文件" : "点右上角「打开书库」，选一本「雪风卷宗」的根目录（含 书卷.yaml 的那层）。"}
        </div>
      </div>
    )
  }

  return (
    <div className="中栏">
      <div className="标签行">
        {标签们.map((标签) => (
          <div
            key={标签.id}
            className={"标签" + (标签.id === 当前标签 ? " 选中" : "")}
            onClick={() => 切标签(标签.id)}
            title={标签.标题}
          >
            <span className="标签字">{标签.标题}</span>
            <button
              className="标签关"
              title="关闭这个标签"
              onClick={(事件) => {
                事件.stopPropagation()
                关标签(标签.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {提示字 ? <span className="标签提示">{提示字}</span> : null}
      </div>

      <div className="编辑器-工具行">
        {属性.切总览 ? (
          <>
            <视图切换 当前="编辑" 切={(视图) => { if (视图 === "全书") 属性.切总览?.() }} />
            <span className="编辑器-分隔" />
          </>
        ) : null}
        <button className="编辑器-工具按钮 纯图标" onClick={撤回} disabled={!可撤回} title="撤回（Ctrl+Z）" aria-label="撤回">
          <图标 名="刷新" 大小={15} 类名="图标 翻转" />
        </button>
        <button className="编辑器-工具按钮 纯图标" onClick={重做} disabled={!可重做} title="重做（Ctrl+Shift+Z）" aria-label="重做">
          <图标 名="刷新" 大小={15} />
        </button>
        <span className="编辑器-分隔" />
        <div className="编辑器-工具栏">
          {工具按钮们.map((钮) => (
            <button
              key={钮.名}
              className="编辑器-工具按钮 纯图标"
              title={钮.说明}
              aria-label={钮.名}
              onMouseDown={(事件) => 事件.preventDefault()}
              onClick={() => 富做(钮.名)}
            >
              <图标 名={钮.图标} 大小={15} />
            </button>
          ))}
        </div>
        {git状态 && !git状态.是Git仓库 ? (
          <>
            <span className="微信息">这本书还不是 Git 仓库，改动无法回滚</span>
            <button className="小按钮" onClick={() => void 初始化Git()} disabled={初始化中} title="在这本书里建一个 Git 仓库，之后每次写入都会自动提交">
              {初始化中 ? "初始化中…" : "初始化"}
            </button>
          </>
        ) : null}
        {台账字 ? (
          <>
            <span
              className={"台账状态" + 台账类}
              title={台账明细 || 台账字}
              onClick={() => set台账详情开((旧) => !旧)}
            >
              {台账在跑 ? <span className="台账转圈" aria-hidden="true" /> : null}
              {台账字}
            </span>
            {台账失败 ? (
              <button className="小按钮 台账重试" onClick={() => void 台账重试()} title="现在就跑一次（不用等静置）">
                立即重试
              </button>
            ) : null}
            {台账详情开 && 台账明细 ? <span className="台账详情">{台账明细}</span> : null}
          </>
        ) : null}
        {属性.去一致性 ? (
          (属性.不一致数 ?? 0) > 0 ? (
            <button className="一致提醒 有" onClick={属性.去一致性} title="去数据面板的「一致性」分类看">
              <图标 名="警告" 大小={13} />
              {属性.不一致数} 处不一致
            </button>
          ) : (
            <span className="一致提醒 好" title="台账之间没有对不上的地方">
              <图标 名="勾" 大小={13} />
              一致性 ✓
            </span>
          )
        ) : null}
        <span className="保存状态" title="每改一次自动保存">{保存状态}</span>
      </div>

      <div className="编辑器-正文区">
        <div className="编辑器-纸面">
        <h1 className="编辑器-标题块">{标题}</h1>
        <div
          ref={富}
          className="编辑器-预览 编辑器-富文本"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-multiline="true"
          aria-label="正文（富文本）"
          onInput={输入}
          onBlur={() => { 同步(); void 提交() }}
          onCompositionStart={() => {
            合成中.current = true
            if (提交计时.current !== null) {
              window.clearTimeout(提交计时.current)
              提交计时.current = null
            }
          }}
          onCompositionEnd={() => {
            合成中.current = false
            同步()
            排提交()
          }}
        />
        </div>
      </div>
    </div>
  )
}
