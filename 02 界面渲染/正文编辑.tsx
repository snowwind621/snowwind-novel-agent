// 只负责一件事：显示并编辑一章正文，给出源码 / 分屏 / 预览三种视图与插入语法的工具栏。
import React, { useEffect, useRef, useState } from "react"
import { 计字数 } from "./接口"
import { 渲染Markdown } from "./编辑器渲染"
import "./编辑器样式.css"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"

type 视图模式 = "源码" | "分屏" | "预览"
const 模式键 = "编辑模式"
const 模式们: 视图模式[] = ["源码", "分屏", "预览"]
const 模式图标: Record<视图模式, 图标名> = { 源码: "代码", 分屏: "分栏", 预览: "眼睛" }

function 读模式(): 视图模式 {
  try {
    const 存 = localStorage.getItem(模式键)
    if (存 === "分屏" || 存 === "预览") return 存
  } catch {
    /* 读不到本地记忆就退回源码 */
  }
  return "源码"
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
}) {
  const { 已开书库, 编号, 标题, 正文, 脏, 改, 保存, 报选区, 状态字 } = 属性
  const [模式, set模式] = useState<视图模式>(读模式)
  const 框 = useRef<HTMLTextAreaElement | null>(null)
  const 预览 = useRef<HTMLDivElement | null>(null)
  const 待选 = useRef<{ 起: number; 止: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(模式键, 模式)
    } catch {
      /* 存不下就算了，不影响写作 */
    }
  }, [模式])

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

  // 三种视图都要能 Ctrl+S：预览里没有输入框，挂在 window 上最省事。
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
        <div className="编辑器-模式">
          {模式们.map((一个) => (
            <button
              key={一个}
              className={"编辑器-模式按钮" + (模式 === 一个 ? " 选中" : "")}
              title={"切到" + 一个 + "视图"}
              onClick={() => set模式(一个)}
            >
              <图标 名={模式图标[一个]} 大小={15} />
              {一个}
            </button>
          ))}
        </div>
        <span className="编辑器-分隔" />
        {模式 === "预览" ? (
          <span className="编辑器-提示">预览只读；要改正文切回源码或分屏，Ctrl+S 照样能保存。</span>
        ) : (
          <div className="编辑器-工具栏">
            {工具按钮们.map((钮) => (
              <button key={钮.名} className="编辑器-工具按钮 纯图标" title={钮.说明} onClick={() => 插入(钮.做)} aria-label={钮.名}>
                <图标 名={钮.图标} 大小={15} />
              </button>
            ))}
          </div>
        )}
      </div>

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
