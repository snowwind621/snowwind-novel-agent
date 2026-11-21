// 只负责一件事：主进程侧的自动更新（electron-updater）——检查、后台下载、提示重启。
// 设计约束：无网 / 无更新 / 没装 electron-updater 时一律静默，绝不弹窗打扰写作。
"use strict"

const 事件名 = {
  状态: "更新/状态",
  就绪: "更新/就绪",
}

/** @type {null | { 初始化自动更新: (选项?: any) => void }} 已加载时导出真实实现 */
let 已加载 = null
try {
  // electron-updater 是可选依赖：没装就整块降级，不报错（开发环境通常没有）
  已加载 = require("electron-updater")
} catch {
  已加载 = null
}

function 包信息() {
  try {
    const 包 = require("../package.json")
    return { 版本: 包.version, 名称: 包.productName || 包.name }
  } catch {
    return { 版本: "0.0.0", 名称: "雪风小说工坊" }
  }
}

/**
 * 初始化自动更新。
 * @param {object} 选项
 * @param {() => any} [选项.取窗口] 返回当前 BrowserWindow（用来推状态给界面）
 * @param {boolean} [选项.开发中] 开发环境直接跳过
 * @param {number} [选项.首次延迟毫秒] 启动后多久查第一次，默认 8 秒
 * @param {number} [选项.间隔毫秒] 之后隔多久查一次，默认 6 小时
 */
function 初始化自动更新(选项 = {}) {
  const { 取窗口 = () => null, 开发中 = false, 首次延迟毫秒 = 8000, 间隔毫秒 = 6 * 3600 * 1000 } = 选项
  if (!已加载 || !已加载.autoUpdater) {
    // 静默降级：只在开发控制台留一行，用户侧什么都不显示
    if (开发中) console.log("[更新] 没装 electron-updater，自动更新关闭")
    return { 可用: false }
  }
  if (开发中) return { 可用: false, 说明: "开发环境不查更新" }

  const { autoUpdater } = 已加载
  const { 版本 } = 包信息()

  const 推 = (阶段, 载荷 = {}) => {
    try {
      const 窗 = 取窗口()
      if (窗 && !窗.isDestroyed()) 窗.webContents.send(事件名.状态, { 阶段, 当前版本: 版本, ...载荷 })
    } catch {
      /* 窗口没了就算了 */
    }
  }

  // 后台下好，退出时自动装：不打断写作
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on("checking-for-update", () => 推("检查中"))
  autoUpdater.on("update-not-available", () => 推("无更新"))
  autoUpdater.on("update-available", (信息) => 推("有新版本", { 新版本: 信息?.version }))
  autoUpdater.on("download-progress", (进度) => 推("下载中", { 百分比: Math.round(进度?.percent ?? 0) }))
  autoUpdater.on("update-downloaded", (信息) => {
    推("已下载", { 新版本: 信息?.version })
    try {
      const 窗 = 取窗口()
      if (窗 && !窗.isDestroyed()) 窗.webContents.send(事件名.就绪, { 新版本: 信息?.version })
    } catch {
      /* 忽略 */
    }
  })
  autoUpdater.on("error", (错误) => 推("出错", { 说明: String(错误?.message ?? 错误) }))

  const 查 = () => {
    try {
      const 果 = autoUpdater.checkForUpdates()
      if (果 && typeof 果.catch === "function") 果.catch(() => 推("出错", { 说明: "连不上更新源" }))
    } catch (错误) {
      推("出错", { 说明: String(错误?.message ?? 错误) })
    }
  }

  setTimeout(查, 首次延迟毫秒)
  setInterval(查, 间隔毫秒)
  return { 可用: true }
}

module.exports = { 初始化自动更新, 事件名 }
