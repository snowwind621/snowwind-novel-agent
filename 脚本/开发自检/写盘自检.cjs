// 只负责一件事：在一次性副本上验证「保存正文 → 原子写 → Git 提交 → 黑板留痕」。
const Module = require("module")
const path = require("path")
const fs = require("fs")

const 处理器 = new Map()
const 假electron = {
  app: {
    whenReady: () => ({ then: (回调) => { 回调(); return { catch: () => {} } } }),
    on: () => {}, quit: () => {},
    getPath: (名) => (名 === "userData" ? path.join(process.env.APPDATA || process.cwd(), "snowwind-novel-agent") : process.cwd()),
  },
  BrowserWindow: class { constructor() { this.webContents = { send: () => {} } } once() {} show() {} loadFile() {} static getAllWindows() { return [] } },
  ipcMain: { handle: (名, 函数) => 处理器.set(名, 函数) },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  contextBridge: { exposeExpose: () => {} },
}
const 原始 = Module._load
Module._load = function (请求) { if (请求 === "electron") return 假electron; return 原始.apply(this, arguments) }
require(path.join(process.cwd(), "dist", "main.cjs"))

const 副本 = process.argv[2]

async function 主() {
  const 事件 = { sender: { send: () => {} } }
  await 处理器.get("项目/打开")(事件, 副本)

  const 原 = await 处理器.get("章节/读取")(事件, 1)
  const 新正文 = 原.正文 + "\n　　这一行是写盘自检追加的。\n"
  const 结果 = await 处理器.get("章节/保存")(事件, 1, 新正文)

  const 回读 = await 处理器.get("章节/读取")(事件, 1)
  const 存在临时 = fs.readdirSync(path.join(副本, "manuscripts.binder")).filter((名) => 名.includes(".tmp-"))

  const { execFileSync } = require("child_process")
  const 日志 = execFileSync("git", ["log", "--oneline", "-n", "3"], { cwd: 副本, encoding: "utf8" }).trim()

  console.log(JSON.stringify({
    保存结果: 结果,
    回读结尾: 回读.正文.slice(-24),
    脏临时文件: 存在临时,
    git最近提交: 日志.split("\n"),
  }, null, 2))
}

主().catch((错误) => { console.error("写盘自检失败：", 错误); process.exit(1) })
