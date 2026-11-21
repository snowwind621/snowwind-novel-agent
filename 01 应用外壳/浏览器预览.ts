// 只负责一件事：不依赖 Electron 外壳，用浏览器把同一套界面跑起来。
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { 创建请求处理 } from "./请求处理"
import { 通道 } from "../03 进程桥接/通道"
import type { 对话请求 } from "../03 进程桥接/通道"

const 端口 = Number(process.env.预览端口 ?? "5178")
const 数据目录 = path.join(os.homedir(), ".雪风小说工坊")
const 静态根 = path.join(process.cwd(), "99 构建产物", "renderer")
const 处理器 = 创建请求处理(
  数据目录,
  async () => 命令行书库(),
  async (建议文件名, 数据) => {
    const 目录 = path.join(os.homedir(), "Downloads")
    fs.mkdirSync(目录, { recursive: true })
    const 文件 = path.join(目录, 建议文件名)
    fs.writeFileSync(文件, 数据)
    return 文件
  },
)

function 命令行书库(): string {
  for (const 参 of process.argv) if (参.startsWith("--书库=")) return 参.slice("--书库=".length)
  return ""
}

const 类型表: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
}

function 读体(请求: http.IncomingMessage): Promise<string> {
  return new Promise((解决) => {
    let 体 = ""
    请求.on("data", (片) => (体 += 片))
    请求.on("end", () => 解决(体))
  })
}

function 应答(响应: http.ServerResponse, 状态: number, 内容: unknown): void {
  响应.writeHead(状态, { "Content-Type": "application/json; charset=utf-8" })
  响应.end(JSON.stringify(内容))
}

const 服务 = http.createServer(async (请求, 响应) => {
  const 地址 = decodeURIComponent((请求.url ?? "/").split("?")[0])
  try {
    if (地址 === "/接口/调用" && 请求.method === "POST") {
      const { 方法, 参数 } = JSON.parse(await 读体(请求))
      const 函数 = 处理器.处理[方法]
      if (!函数) return 应答(响应, 404, { 错误: "没有这个通道：" + 方法 })
      try {
        return 应答(响应, 200, { 结果: await 函数(...(参数 ?? [])) })
      } catch (错误: any) {
        return 应答(响应, 200, { 错误: String(错误?.message ?? 错误) })
      }
    }

    // 台账自动同步进度：一条 SSE 长连接，界面订阅用
    if (地址 === "/接口/自动同步" && 请求.method === "GET") {
      响应.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      处理器.设置推送((类型, 载荷) => {
        响应.write("data: " + JSON.stringify({ 类型, 载荷 }) + "\n\n")
      })
      请求.on("close", () => 处理器.设置推送(() => {}))
      return
    }

    if (地址 === "/接口/对话" && 请求.method === "POST") {
      const 对话 = JSON.parse(await 读体(请求)) as 对话请求
      响应.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      const 发 = (类型: string, 文本: string) =>
        响应.write("data: " + JSON.stringify({ 请求号: 对话.请求号, 类型, 文本 }) + "\n\n")
      try {
        await 处理器.流式(对话, 发 as any)
        发("结束", "")
      } catch (错误: any) {
        发("错误", String(错误?.message ?? 错误))
      }
      响应.end()
      return
    }

    if (地址 === "/接口/续写" && 请求.method === "POST") {
      const 续写请求 = JSON.parse(await 读体(请求))
      响应.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      const 发 = (类型: string, 文本: string) =>
        响应.write("data: " + JSON.stringify({ 请求号: 续写请求.请求号, 类型, 文本 }) + "\n\n")
      try {
        await 处理器.续写(续写请求, 发 as any)
        发("结束", "")
      } catch (错误: any) {
        发("错误", String(错误?.message ?? 错误))
      }
      响应.end()
      return
    }

    if (地址 === "/接口/改写" && 请求.method === "POST") {
      const 改写请求 = JSON.parse(await 读体(请求))
      响应.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      const 发 = (类型: string, 文本: string) =>
        响应.write("data: " + JSON.stringify({ 请求号: 改写请求.请求号, 类型, 文本 }) + "\n\n")
      try {
        await 处理器.改写(改写请求, 发 as any)
        发("结束", "")
      } catch (错误: any) {
        发("错误", String(错误?.message ?? 错误))
      }
      响应.end()
      return
    }

    if (地址 === "/接口/派活" && 请求.method === "POST") {
      const { 任务, 章节号 } = JSON.parse(await 读体(请求))
      响应.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      const 发 = (内容: unknown) => 响应.write("data: " + JSON.stringify(内容) + "\n\n")
      try {
        const 结果 = await 处理器.派活(任务, 章节号, (进度) => 发({ 类型: "进度", ...进度 }))
        发({ 类型: "完成", 结果 })
      } catch (错误: any) {
        发({ 类型: "错误", 说明: String(错误?.message ?? 错误) })
      }
      响应.end()
      return
    }

    let 相对 = 地址 === "/" ? "/index.html" : 地址
    const 文件 = path.join(静态根, decodeURIComponent(相对))
    if (!文件.startsWith(静态根) || !fs.existsSync(文件) || fs.statSync(文件).isDirectory()) {
      return 应答(响应, 404, { 错误: "找不到文件：" + 相对 })
    }
    // 构建产物文件名带哈希，构建一变旧缓存就会白屏；预览服务一律禁缓存，刷新即得最新。
  响应.writeHead(200, {
    "Content-Type": 类型表[path.extname(文件)] ?? "application/octet-stream",
    "Cache-Control": "no-store, max-age=0",
  })
    fs.createReadStream(文件).pipe(响应)
  } catch (错误: any) {
    应答(响应, 500, { 错误: String(错误?.message ?? 错误) })
  }
})

服务.listen(端口, "127.0.0.1", () => {
  const 设置 = 处理器.处理[通道.读取设置]
  console.log("界面已启动：http://127.0.0.1:" + 端口)
  console.log("数据目录：" + 数据目录)
  void 设置
})
