// 只负责一件事：把 React 应用挂到页面上。
import React from "react"
import { createRoot } from "react-dom/client"
import { 三栏布局 } from "./三栏布局"
import "./样式.css"

// 主题：先读本地记忆，避免亮暗闪烁
const 链接主题 = new URLSearchParams(location.search).get("主题")
const 已存主题 = 链接主题 ?? localStorage.getItem("主题") ?? "暗"
document.documentElement.dataset.主题 = 已存主题

const 容器 = document.getElementById("根")
if (容器) {
  createRoot(容器).render(
    <React.StrictMode>
      <三栏布局 />
    </React.StrictMode>,
  )
}
