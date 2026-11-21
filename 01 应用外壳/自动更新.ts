// 只负责一件事：主进程侧的自动更新——检查、后台下载、退出时装。
// 约束：无网 / 无更新 / 更新源连不上时一律静默，绝不弹窗打断写作。
import type { BrowserWindow } from "electron"

export const 更新事件 = { 状态: "更新/状态", 就绪: "更新/就绪" } as const

export interface 更新选项 {
  取窗口?: () => BrowserWindow | null
  开发中?: boolean
  首次延迟毫秒?: number
  间隔毫秒?: number
}

export interface 更新结果 {
  可用: boolean
  说明?: string
}

export async function 初始化自动更新(选项: 更新选项 = {}): Promise<更新结果> {
  const { 取窗口 = () => null, 开发中 = false, 首次延迟毫秒 = 8000, 间隔毫秒 = 6 * 3600 * 1000 } = 选项
  if (开发中) return { 可用: false, 说明: "开发环境不查更新" }

  let 模块: any = null
  try {
    // 动态引入：没装 electron-updater 时整块降级，不影响启动
    模块 = await import("electron-updater")
  } catch {
    return { 可用: false, 说明: "没装 electron-updater" }
  }
  const { autoUpdater } = 模块
  if (!autoUpdater) return { 可用: false, 说明: "electron-updater 结构异常" }

  let 版本 = "0.0.0"
  try {
    版本 = String((await import("../package.json")).default?.version ?? "0.0.0")
  } catch {
    /* 拿不到版本就报 0.0.0 */
  }

  const 推 = (事件: string, 载荷: Record<string, unknown>) => {
    try {
      const 窗 = 取窗口()
      if (窗 && !窗.isDestroyed()) 窗.webContents.send(事件, { 当前版本: 版本, ...载荷 })
    } catch {
      /* 窗口没了就算了 */
    }
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.on("checking-for-update", () => 推(更新事件.状态, { 阶段: "检查中" }))
  autoUpdater.on("update-not-available", () => 推(更新事件.状态, { 阶段: "无更新" }))
  autoUpdater.on("update-available", (信息: any) => 推(更新事件.状态, { 阶段: "有新版本", 新版本: 信息?.version }))
  autoUpdater.on("download-progress", (进度: any) => 推(更新事件.状态, { 阶段: "下载中", 百分比: Math.round(进度?.percent ?? 0) }))
  autoUpdater.on("update-downloaded", (信息: any) => {
    推(更新事件.状态, { 阶段: "已下载", 新版本: 信息?.version })
    推(更新事件.就绪, { 阶段: "就绪", 新版本: 信息?.version })
  })
  autoUpdater.on("error", (错误: any) => 推(更新事件.状态, { 阶段: "出错", 说明: String(错误?.message ?? 错误) }))

  const 查 = () => {
    try {
      const 果 = autoUpdater.checkForUpdates()
      if (果 && typeof 果.catch === "function") 果.catch(() => 推(更新事件.状态, { 阶段: "出错", 说明: "连不上更新源" }))
    } catch {
      /* 静默 */
    }
  }

  const 首 = setTimeout(查, 首次延迟毫秒)
  const 周期 = setInterval(查, 间隔毫秒)
  // 进程退出时别留定时器
  if (typeof 首.unref === "function") 首.unref()
  if (typeof 周期.unref === "function") 周期.unref()
  return { 可用: true }
}