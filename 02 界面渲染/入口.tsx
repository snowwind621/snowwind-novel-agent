// 只负责一件事：把 React 应用挂到页面上，先把外观刷上，并保证出错时不是白屏。
import React from "react"
import { createRoot } from "react-dom/client"
import { 三栏布局 } from "./三栏布局"
import { 应用外观, 读缓存外观, 默认设置 } from "./接口"
import "./样式.css"

// 深链 ?清缓存=1：把本地缓存清干净再进界面。白屏时的第一条自救手段。
const 参数 = new URLSearchParams(location.search)
if (参数.get("清缓存") === "1") {
  try {
    localStorage.clear()
  } catch {
    /* 清不掉也只能继续 */
  }
  参数.delete("清缓存")
  const 余 = 参数.toString()
  location.replace(location.pathname + (余 ? "?" + 余 : ""))
}

// 外观：先用上次缓存的上一份把 CSS 变量与 data-* 铺好，避免等桥回来再闪一下。
const 链接主题 = 参数.get("主题")
const 缓存外观 = 读缓存外观()
const 初始外观 = { ...默认设置.外观, ...(缓存外观 ?? {}) }
// 深链 ?主题=亮 只影响这一次显示，不改用户存下来的设置
if (链接主题 === "亮" || 链接主题 === "暗") 初始外观.主题 = 链接主题
应用外观(初始外观, !链接主题)

/** 出错时显示原因与自救按钮——宁可难看，也不能让用户对着一片空白。 */
function 报错卡(内容: string, 详情?: string) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--底, #16181d)",
        color: "var(--字, #d7dae2)",
        padding: "48px 56px",
        fontFamily: "var(--编辑字体, system-ui)",
        lineHeight: 1.8,
        overflow: "auto",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>界面没能启动</div>
      <div style={{ marginBottom: 16, color: "var(--字弱, #8b919e)" }}>
        {内容}
        <br />
        先把本地缓存清掉再试：点下面按钮，或打开{" "}
        <code>http://127.0.0.1:5178/?清缓存=1</code>
      </div>
      <button
        onClick={() => {
          try {
            localStorage.clear()
          } catch {
            /* 忽略 */
          }
          location.href = location.pathname
        }}
        style={{ padding: "8px 16px", marginRight: 12, cursor: "pointer" }}
      >
        清空本地缓存并重载
      </button>
      <button onClick={() => location.reload()} style={{ padding: "8px 16px", cursor: "pointer" }}>
        仅重载
      </button>
      {详情 ? (
        <pre
          style={{
            marginTop: 24,
            padding: 16,
            background: "rgba(0,0,0,.35)",
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "var(--字弱, #8b919e)",
          }}
        >
          {详情}
        </pre>
      ) : null}
    </div>
  )
}

class 兜底 extends React.Component<{ children: React.ReactNode }, { 错: Error | null }> {
  state = { 错: null as Error | null }
  static getDerivedStateFromError(错: Error) {
    return { 错 }
  }
  render() {
    if (this.state.错) return 报错卡("渲染过程中抛了异常。", String(this.state.错?.stack ?? this.state.错))
    return this.props.children
  }
}

// 渲染之外的异常（事件回调、异步）也要能看见，不然照样一片白。
window.addEventListener("error", (事) => {
  const 容器 = document.getElementById("根")
  if (容器 && 容器.childElementCount === 0) {
    容器.appendChild(document.createElement("div"))
  }
  console.error("[界面错误]", 事.error ?? 事.message)
})

const 容器 = document.getElementById("根")
if (容器) {
  createRoot(容器).render(
    <React.StrictMode>
      <兜底>
        <三栏布局 />
      </兜底>
    </React.StrictMode>,
  )
}
