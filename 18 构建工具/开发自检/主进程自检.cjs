// 只负责一件事：用假的 electron 模块加载真实主进程，逐个调用 IPC 通道做无界面自检。
const Module = require("module")
const path = require("path")

const 处理器 = new Map()
const 窗口们 = []
const 载入记录 = []

const 假electron = {
  app: {
    whenReady: () => ({ then: (回调) => { 回调(); return { catch: () => {} } } }),
    on: () => {},
    quit: () => {},
    getPath: (名) => (名 === "userData" ? path.join(process.env.APPDATA || process.cwd(), "snowwind-novel-agent") : process.cwd()),
  },
  BrowserWindow: class {
    constructor(选项) { this.选项 = 选项; this.webContents = { send: () => {} }; 窗口们.push(this) }
    once() {}
    show() {}
    loadFile(文件) { 载入记录.push(文件) }
    static getAllWindows() { return 窗口们 }
  },
  ipcMain: { handle: (名, 函数) => 处理器.set(名, 函数) },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: async () => null, on: () => {}, off: () => {} },
}

const 原始加载 = Module._load
Module._load = function (请求, 父模块, 是否主) {
  if (请求 === "electron") return 假electron
  return 原始加载.apply(this, arguments)
}

require(path.join(process.cwd(), "99 构建产物", "main.cjs"))

const 书库 = process.argv[2]

async function 主() {
  const 事件 = { sender: { send: () => {} } }
  const 结果 = {}

  结果.已注册通道数 = 处理器.size
  结果.通道名 = [...处理器.keys()]
  结果.窗口页 = 载入记录

  const 项目 = await 处理器.get("项目/打开")(事件, 书库)
  结果.打开项目 = { 书名: 项目.书名, 章数: 项目.统计.章数, 卷数: 项目.卷.length, 最新章节: 项目.统计.最新章节 }

  const 旧 = await 处理器.get("项目/当前")(事件)
  结果.当前项目 = 旧 ? 旧.书名 : null

  const 章 = await 处理器.get("章节/读取")(事件, 27)
  结果.读第27章 = { 标题: 章.标题, 字数: 章.正文.length, 开头: 章.正文.slice(0, 24) }

  const 看板 = await 处理器.get("看板/读取")(事件)
  结果.看板 = 看板.统计

  const 设置 = await 处理器.get("设置/读取")(事件)
  结果.设置 = { 网关: 设置.模型.网关地址, 助手: 设置.模型.分工.助手, 记住的书: path.basename(设置.书库.上次路径 || "") }

  const 模型 = await 处理器.get("模型/清单")(事件)
  结果.模型清单 = Array.isArray(模型) ? { 数量: 模型.length, 含目标: 模型.includes("cnwrokbuddy-ds") } : 模型

  const 缺章 = await 处理器.get("章节/读取")(事件, 999).then(() => "居然成功了").catch((e) => "按预期报错：" + e.message)
  结果.读不存在章 = 缺章

  console.log(JSON.stringify(结果, null, 2))
}

主().catch((错误) => {
  console.error("主进程自检失败：", 错误)
  process.exit(1)
})
