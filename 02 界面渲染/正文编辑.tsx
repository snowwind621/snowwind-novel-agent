// 只负责一件事：显示并编辑一章正文，给出富文本 / 源码 / 分屏 / 预览四种视图与插入语法的工具栏。
import React, { useEffect, useRef, useState } from "react"
import { 计字数 } from "./接口"
import { 渲染Markdown, 取回Markdown } from "./编辑器渲染"
import "./编辑器样式.css"
import { 视图切换 } from "./视觉总览"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"

type 视图模式 = "富文本" | "源码" | "分屏" | "预览"
const 模式键 = "编辑模式"
const 模式们: 视图模式[] = ["富文本", "源码", "分屏", "预览"]
const 模式图标: Record<视图模式, 图标名> = { 富文本: "笔", 源码: "代码", 分屏: "分栏", 预览: "眼睛" }

function 读模式(): 视图模式 {
  try {
    const 存 = localStorage.getItem(模式键)
    if (存 === "富文本" || 存 === "源码" || 存 === "分屏" || 存 === "预览") return 存
  } catch {
    /* 读不到本地记忆就用富文本 */
  }
  return "富文本"
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

/**
 * 行级前缀：处理选区覆盖到的整行。
 * 每行都已经带这个前缀时，再点一次就是整段取消（标题/引用/列表都能来回切换）。
 */
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

export function 正文编辑(属性: {
  已开书库: boolean
  编号: number | null
  标题: string
  正文: string
  脏: boolean
  改: (正文: string) => void
  保存: () => void
  报选区: (起: number, 止: number) => void
  状态字: string
  /** 切到中栏的「全书视图」；不传就不显示这两个视图按钮 */
  切总览?: () => void
}) {
  const { 已开书库, 编号, 标题, 正文, 脏, 改, 保存, 报选区, 状态字 } = 属性
  const [模式, set模式] = useState<视图模式>(读模式)
  const 框 = useRef<HTMLTextAreaElement | null>(null)
  const 富 = useRef<HTMLDivElement | null>(null)
  const 预览 = useRef<HTMLDivElement | null>(null)
  const 待选 = useRef<{ 起: number; 止: number } | null>(null)
  const 合成中 = useRef(false)
  const 计时 = useRef<number | null>(null)
  const 上次渲染 = useRef("")
  const 上次编号 = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(模式键, 模式)
    } catch {
      /* 存不下就算了，不影响写作 */
    }
  }, [模式])

  // 进入富文本 / 换章 / 外部改了正文（续写插入、采纳改写）时，才把 Markdown 灌进 contenteditable。
  // 用户自己敲出来的内容不回灌，否则光标会跳、输入法会被打断。
  useEffect(() => {
    if (模式 !== "富文本") return
    const 元素 = 富.current
    if (!元素) return
    if (合成中.current) return
    if (计时.current !== null) {
      window.clearTimeout(计时.current)
      计时.current = null
    }
    const 换章 = 上次编号.current !== 编号
    上次编号.current = 编号
    if (!换章 && 上次渲染.current === 正文 && 元素.innerHTML !== "") return
    上次渲染.current = 正文
    元素.innerHTML = 渲染Markdown(正文, { 缩进当文字: true }) || "<p><br></p>"
  }, [模式, 正文, 编号])

  // 工具栏改完文本要把光标/选区放回去，否则光标会跳到末尾。
  useEffect(() => {
    const 值 = 待选.current
    const 元素 = 框.current
    if (!值 || !元素) return
    待选.current = null
    元素.focus()
    元素.setSelectionRange(值.起, 值.止)
    报选区(值.起, 值.止)
  }, [正文, 模式])

  // 四种视图都要能 Ctrl+S：预览和富文本里都没有输入框，挂在 window 上最省事。
  useEffect(() => {
    const 按键 = (事件: KeyboardEvent) => {
      if ((事件.ctrlKey || 事件.metaKey) && 事件.key.toLowerCase() === "s") {
        事件.preventDefault()
        保存()
      }
    }
    window.addEventListener("keydown", 按键)
    return () => window.removeEventListener("keydown", 按键)
  }, [保存])

  if (编号 === null) {
    return (
      <div className="中栏">
        <div className="空态">
          {已开书库 ? "已完成装载。" : "还没有打开书库。"}
          <br />
          {已开书库 ? "在左边点一章开始写。" : "点右上角「打开书库」，选一本「雪风卷宗」的根目录（含 书卷.yaml 的那层）。"}
        </div>
      </div>
    )
  }

  const 插入 = (做: (文: string, 起: number, 止: number) => 改后) => {
    const 元素 = 框.current
    const 起 = 元素?.selectionStart ?? 正文.length
    const 止 = 元素?.selectionEnd ?? 正文.length
    const 结果 = 做(正文, 起, 止)
    待选.current = { 起: 结果.起, 止: 结果.止 }
    改(结果.文)
  }

  /** 富文本 → 源码：DOM 只做显示，落盘的永远是 Markdown 纯文本。 */
  const 同步到源码 = () => {
    const 元素 = 富.current
    if (!元素 || 合成中.current) return
    const 换行 = 正文.includes("\r\n") ? "\r\n" : "\n"
    const 新文 = 取回Markdown(元素, 换行)
    if (新文 === 正文) return
    上次渲染.current = 新文
    改(新文)
  }

  const 富输入 = () => {
    if (合成中.current) return
    // 回车分会插一个新段：趁 input 这一刻把上一段的缩进抄过来（放 keydown 里会因为默认动作还没做完而落空）
    补首行缩进()
    if (计时.current !== null) window.clearTimeout(计时.current)
    计时.current = window.setTimeout(() => {
      计时.current = null
      同步到源码()
    }, 150)
  }

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

  /** 行内记号：把选区换成「语法包起来再渲染」的节点。没选中就插一对记号，光标停中间。 */
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
      同步到源码()
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
    同步到源码()
  }

  const 换块 = (造: (旧块: HTMLElement) => HTMLElement | null) => {
    const 根 = 富.current
    const 块 = 当前块()
    if (!根 || !块) return
    const 新块 = 造(块)
    if (!新块) return
    块.replaceWith(新块)
    根.focus()
    同步到源码()
  }

  const 富标题 = () =>
    换块((块) => {
      const 新 = document.createElement(块.tagName === "H2" ? "P" : "H2")
      新.innerHTML = 块.innerHTML.replace(/^[\u3000\s]+/, "")
      return 新
    })

  const 富引用 = () =>
    换块((块) => {
      const 内 = document.createElement("P")
      if (块.tagName === "BLOCKQUOTE") {
        内.innerHTML = 块.innerHTML
        return 内
      }
      内.innerHTML = 块.innerHTML
      const 包 = document.createElement("BLOCKQUOTE")
      包.appendChild(内)
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
    同步到源码()
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

  const 切模式 = (新: 视图模式) => {
    if (模式 === "富文本" && 新 !== "富文本") 同步到源码()
    set模式(新)
  }

  /** 分屏同步滚动：按百分比对齐就够，不做行到行映射。 */
  const 同步滚动 = () => {
    const 源 = 框.current
    const 果 = 预览.current
    if (!源 || !果) return
    const 源可滚 = 源.scrollHeight - 源.clientHeight
    const 比例 = 源可滚 > 0 ? 源.scrollTop / 源可滚 : 0
    果.scrollTop = 比例 * Math.max(0, 果.scrollHeight - 果.clientHeight)
  }

  const 报选 = (元素: HTMLTextAreaElement) => 报选区(元素.selectionStart ?? 0, 元素.selectionEnd ?? 0)
  const 预览HTML = 渲染Markdown(正文)

  return (
    <div className="中栏">
      <div className="编辑器头">
        <strong>{"ch" + 编号 + "　" + 标题}</strong>
        <span>{计字数(正文)} 字</span>
        <div className="右">
          <span>{脏 ? "● 未保存" : "已保存"}</span>
          <button onClick={保存} disabled={!脏} title="保存并提交（Ctrl+S）">
            <图标 名="保存" />
            保存并提交
          </button>
          <span>{状态字}</span>
        </div>
      </div>

      <div className="编辑器-工具行">
        {属性.切总览 ? (
          <>
            <视图切换 当前="编辑" 切={(视图) => {
              if (视图 === "全书") 属性.切总览?.()
            }} />
            <span className="编辑器-分隔" />
          </>
        ) : null}
        <div className="编辑器-模式">
          {模式们.map((一个) => (
            <button
              key={一个}
              className={"编辑器-模式按钮" + (模式 === 一个 ? " 选中" : "")}
              title={"切到" + 一个 + "视图"}
              onClick={() => 切模式(一个)}
            >
              <图标 名={模式图标[一个]} 大小={15} />
              {一个}
            </button>
          ))}
        </div>
        <span className="编辑器-分隔" />
        {模式 === "预览" ? (
          <span className="编辑器-提示">预览只读；要改正文切回富文本或源码，Ctrl+S 照样能保存。</span>
        ) : (
          <div className="编辑器-工具栏">
            {工具按钮们.map((钮) => (
              <button
                key={钮.名}
                className="编辑器-工具按钮 纯图标"
                title={钮.说明}
                aria-label={钮.名}
                onClick={() => (模式 === "富文本" ? 富做(钮.名) : 插入(钮.做))}
              >
                <图标 名={钮.图标} 大小={15} />
              </button>
            ))}
          </div>
        )}
      </div>

      {模式 === "富文本" ? (
        <div
          ref={富}
          className="编辑器-预览 编辑器-富文本"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-multiline="true"
          aria-label="正文（富文本）"
          onInput={富输入}
          onBlur={同步到源码}
          onCompositionStart={() => {
            合成中.current = true
            if (计时.current !== null) {
              window.clearTimeout(计时.current)
              计时.current = null
            }
          }}
          onCompositionEnd={() => {
            合成中.current = false
            同步到源码()
          }}
        />
      ) : null}

      {模式 === "源码" ? (
        <textarea
          ref={框}
          className="正文"
          value={正文}
          spellCheck={false}
          onChange={(事件) => 改(事件.target.value)}
          onSelect={(事件) => 报选(事件.currentTarget)}
        />
      ) : null}

      {模式 === "分屏" ? (
        <div className="编辑器-分屏">
          <textarea
            ref={框}
            className="正文 编辑器-源码"
            value={正文}
            spellCheck={false}
            onChange={(事件) => 改(事件.target.value)}
            onScroll={同步滚动}
            onSelect={(事件) => 报选(事件.currentTarget)}
          />
          <div className="编辑器-预览" ref={预览} dangerouslySetInnerHTML={{ __html: 预览HTML }} />
        </div>
      ) : null}

      {模式 === "预览" ? (
        <div className="编辑器-预览 编辑器-预览-整页" ref={预览} dangerouslySetInnerHTML={{ __html: 预览HTML }} />
      ) : null}
    </div>
  )
}