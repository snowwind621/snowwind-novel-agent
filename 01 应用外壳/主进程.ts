// 只负责一件事：把窗口跑起来，并把界面发来的请求交给共用的处理器。
import { app, BrowserWindow, dialog, ipcMain } from "electron"
import path from "node:path"
import fs from "node:fs"
import { 通道, 推送事件 } from "../03 进程桥接/通道"
import type { 对话请求, 续写请求, 改写请求 } from "../03 进程桥接/通道"
import { 创建请求处理 } from "./请求处理"
import { 初始化自动更新 } from "./自动更新"

/** 启动诊断：出问题时先看 userData/诊断.log，而不是猜。 */
function 诊断(行: string): void {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "诊断.log"), new Date().toISOString() + " " + 行 + "\n")
  } catch {
    /* 诊断不许影响启动 */
  }
}

function 命令行书库(): string {
  for (let i = 0; i < process.argv.length; i++) {
    const 参 = process.argv[i]
    if (参 === "--书库") return process.argv[i + 1] ?? ""
    if (参.startsWith("--书库=")) return 参.slice("--书库=".length)
  }
  return ""
}

function 建窗口(): BrowserWindow {
  const 窗口 = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#14151a",
    title: "雪风小说工坊",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  窗口.once("ready-to-show", () => 窗口.show())
  窗口.loadFile(path.join(__dirname, "renderer", "index.html"))
  return 窗口
}

app.whenReady().then(async () => {
  // 自动更新：打包后才查；开发环境与无网一律静默
  // 取当前窗口：自动更新那边只需要一个可用的 BrowserWindow
  void 初始化自动更新({ 取窗口: () => BrowserWindow.getAllWindows()[0] ?? null, 开发中: !app.isPackaged })
  诊断("启动 userData=" + app.getPath("userData") + " argv=" + process.argv.join(" "))

  const 处理器 = 创建请求处理(
    app.getPath("userData"),
    async () => {
      const 结果 = await dialog.showOpenDialog({ title: "选择书库目录", properties: ["openDirectory"] })
      return 结果.canceled ? null : (结果.filePaths[0] ?? null)
    },
    async (建议文件名, 数据) => {
      const 结果 = await dialog.showSaveDialog({ title: "导出到哪里", defaultPath: 建议文件名 })
      if (结果.canceled || !结果.filePath) throw new Error("已取消")
      fs.writeFileSync(结果.filePath, 数据)
      return 结果.filePath
    },
  )

  for (const [名, 函数] of Object.entries(处理器.处理)) {
    ipcMain.handle(名, async (_事件, ...参数: any[]) => 函数(...参数))
  }

  // 台账自动同步的进度：主进程把它推到所有窗口（界面据此更新状态字）
  处理器.设置推送((类型, 载荷) => {
    for (const 窗 of BrowserWindow.getAllWindows()) 窗.webContents.send(类型, 载荷)
  })

  ipcMain.handle(通道.发送对话, async (事件, 请求: 对话请求) => {
    const 发 = (类型: "思考" | "正文", 文本: string) =>
      事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型, 文本 })
    void (async () => {
      try {
        await 处理器.流式(请求, 发)
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型: "结束", 文本: "" })
      } catch (错误: any) {
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型: "错误", 文本: String(错误?.message ?? 错误) })
      }
    })()
    诊断("对话开始 " + 请求.请求号 + " 模型=" + 请求.模型)
    return { 已接收: true }
  })

  ipcMain.handle(通道.中止对话, async (_事件, 请求号: string) => ({ 已中止: 处理器.中止(请求号) }))

  ipcMain.handle(通道.续写, async (事件, 请求: 续写请求) => {
    void (async () => {
      const 发 = (类型: "思考" | "正文", 文本: string) =>
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型, 文本 })
      try {
        await 处理器.续写(请求, 发)
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型: "结束", 文本: "" })
      } catch (错误: any) {
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型: "错误", 文本: String(错误?.message ?? 错误) })
      }
    })()
    return { 已接收: true }
  })

  ipcMain.handle(通道.改写, async (事件, 请求: 改写请求) => {
    void (async () => {
      const 发 = (类型: "思考" | "正文", 文本: string) =>
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型, 文本 })
      try {
        await 处理器.改写(请求, 发)
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型: "结束", 文本: "" })
      } catch (错误: any) {
        事件.sender.send(推送事件.对话增量, { 请求号: 请求.请求号, 类型: "错误", 文本: String(错误?.message ?? 错误) })
      }
    })()
    return { 已接收: true }
  })

  ipcMain.handle(通道.集群派活, async (事件, 任务: string, 编号: number) => {
    const 任务号 = "派-" + Date.now()
    return 处理器.派活(任务, 编号, (进度) => {
      事件.sender.send(推送事件.派活进度, { ...进度, 任务号 })
    })
  })

  建窗口()

  const 指定书库 = 命令行书库()
  if (指定书库) 诊断("命令行书库=" + 指定书库)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) 建窗口()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
