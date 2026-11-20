// 只负责一件事：在没有 Electron 外壳时，用 HTTP 把界面接到同一个处理器上。
import type { 项目摘要, 看板数据, 设置, 对话请求, 续写请求, 改写请求 } from "../03 进程桥接/通道"
import type { 知情结果 } from "./接口"
import type { 桥接口, 对话事件, 派活进度 } from "./接口"

async function 调用(方法: string, ...参数: unknown[]): Promise<any> {
  const 响应 = await fetch("/接口/调用", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 方法, 参数 }),
  })
  const 数据 = await 响应.json()
  if (数据?.错误) throw new Error(数据.错误)
  return 数据?.结果
}

/** 把一条 SSE 流读成事件，逐个交给界面。 */
async function 流式请求(
  地址: string,
  载荷: unknown,
  监听者: Set<(事件: 对话事件) => void>,
  请求号: string,
): Promise<void> {
  try {
    const 响应 = await fetch(地址, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(载荷),
    })
    if (!响应.body) throw new Error("没有响应体")
    const 读 = 响应.body.getReader()
    const 解 = new TextDecoder()
    let 缓冲 = ""
    for (;;) {
      const { value, done } = await 读.read()
      if (done) break
      缓冲 += 解.decode(value, { stream: true })
      const 段们 = 缓冲.split("\n\n")
      缓冲 = 段们.pop() ?? ""
      for (const 段 of 段们) {
        const 行 = 段.split("\n").find((x) => x.startsWith("data:"))
        if (!行) continue
        try {
          const 事件 = JSON.parse(行.slice(5)) as 对话事件
          for (const 回调 of 监听者) 回调(事件)
        } catch {
          /* 忽略残帧 */
        }
      }
    }
  } catch (错误: any) {
    for (const 回调 of 监听者) 回调({ 请求号, 类型: "错误", 文本: String(错误?.message ?? 错误) })
  }
}

export function 创建网页桥(): 桥接口 {
  const 监听者 = new Set<(事件: 对话事件) => void>()
  const 派活监听者 = new Set<(事件: 派活进度) => void>()

  return {
    打开项目: (路径: string) => 调用("项目/打开", 路径),
    当前项目: () => 调用("项目/当前"),
    读取章节: (编号: number) => 调用("章节/读取", 编号),
    保存章节: (编号: number, 正文: string) => 调用("章节/保存", 编号, 正文),
    读取看板: () => 调用("看板/读取"),
    台账同步: (章节号: number) => 调用("台账/同步", 章节号),
    集群成员: () => 调用("集群/成员"),
    新建成员: (名称: string, 职责: string, 管辖文本: string) => 调用("集群/新建", 名称, 职责, 管辖文本),
    删除成员: (id: string) => 调用("集群/删除", id),
    改成员: (id: string, 名称: string, 职责: string, 管辖文本: string) => 调用("集群/改", id, 名称, 职责, 管辖文本),
    改写: (请求: 改写请求) => {
      void 流式请求("/接口/改写", 请求, 监听者, 请求.请求号)
      return Promise.resolve({ 已接收: true })
    },
    续写: (请求: 续写请求) => {
      void 流式请求("/接口/续写", 请求, 监听者, 请求.请求号)
      return Promise.resolve({ 已接收: true })
    },
    导出: (格式: string) => 调用("导出/执行", 格式),
    导入旧书库: (旧根: string, 新根: string) => 调用("书库/导入", 旧根, 新根),
    书库文件树: () => 调用("书库/文件树"),
    书库读文件: (相对路径: string) => 调用("书库/读文件", 相对路径),
    书库写文件: (相对路径: string, 内容: string) => 调用("书库/写文件", 相对路径, 内容),
    查知情: (秘密?: string, 人?: string, 截至章?: number) =>
      调用("书库/查知情", 秘密 ?? "", 人 ?? "", 截至章 ?? 0) as Promise<知情结果>,
    书库Git状态: () => 调用("书库/Git状态"),
    初始化书库Git: () => 调用("书库/初始化Git"),
    书架: () => 调用("书架/读取"),
    移出书架: (路径: string) => 调用("书架/移除", 路径),
    监听派活: (回调: (事件: 派活进度) => void) => {
      派活监听者.add(回调)
      return () => 派活监听者.delete(回调)
    },
    派活: (任务: string, 章节号: number) =>
      new Promise((解决, 拒绝) => {
        void (async () => {
          try {
            const 响应 = await fetch("/接口/派活", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 任务, 章节号 }),
            })
            if (!响应.body) throw new Error("没有响应体")
            const 读 = 响应.body.getReader()
            const 解 = new TextDecoder()
            let 缓冲 = ""
            for (;;) {
              const { value, done } = await 读.read()
              if (done) break
              缓冲 += 解.decode(value, { stream: true })
              const 段们 = 缓冲.split("\n\n")
              缓冲 = 段们.pop() ?? ""
              for (const 段 of 段们) {
                const 行 = 段.split("\n").find((x) => x.startsWith("data:"))
                if (!行) continue
                const 事件 = JSON.parse(行.slice(5))
                if (事件.类型 === "进度") for (const 回 of 派活监听者) 回(事件 as 派活进度)
                else if (事件.类型 === "完成") 解决(事件.结果)
                else if (事件.类型 === "错误") 拒绝(new Error(事件.说明))
              }
            }
          } catch (错误: any) {
            拒绝(错误)
          }
        })()
      }),
    模型清单: () => 调用("模型/清单"),
    读取设置: () => 调用("设置/读取"),
    保存设置: (设置: 设置) => 调用("设置/保存", 设置),
    发送对话: (请求: 对话请求) => {
      void 流式请求("/接口/对话", 请求, 监听者, 请求.请求号)
      return Promise.resolve({ 已接收: true })
    },
    中止对话: (请求号: string) => 调用("ai/中止", 请求号),
    监听对话: (回调: (事件: 对话事件) => void) => {
      监听者.add(回调)
      return () => 监听者.delete(回调)
    },
  }
}
