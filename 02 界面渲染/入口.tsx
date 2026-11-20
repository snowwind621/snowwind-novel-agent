// 只负责一件事：把 React 应用挂到页面上，并先把外观刷上。
import React from "react"
import { createRoot } from "react-dom/client"
import { 三栏布局 } from "./三栏布局"
import { 应用外观, 读缓存外观, 默认设置 } from "./接口"
import "./样式.css"

// 外观：先用上次缓存的上一份把 CSS 变量与 data-* 铺好，避免等桥回来再闪一下。
const 链接主题 = new URLSearchParams(location.search).get("主题")
const 缓存外观 = 读缓存外观()
const 初始外观 = { ...默认设置.外观, ...(缓存外观 ?? {}) }
// 深链 ?主题=亮 只影响这一次显示，不改用户存下来的设置
if (链接主题 === "亮" || 链接主题 === "暗") 初始外观.主题 = 链接主题
应用外观(初始外观, !链接主题)

const 容器 = document.getElementById("根")
if (容器) {
  createRoot(容器).render(
    <React.StrictMode>
      <三栏布局 />
    </React.StrictMode>,
  )
}
