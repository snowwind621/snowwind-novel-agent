// 只负责一件事：在没有 Electron 外壳时，用 HTTP 把界面接到同一个处理器上。
import type { 项目摘要, 看板数据, 设置, 对话请求, 续写请求, 改写请求 } from "../03 进程桥接/通道"
import type { 知情结果, 一致性报告, 一致性提示, 一致性问题, 补齐结果, 自动同步状态, 自动同步进度, 同步结果 } from "./接口"
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
    保存章节: (编号: number, 正文: string, 立即?: boolean) => 调用("章节/保存", 编号, 正文, 立即 ?? false),
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
    台账自动状态: () => 调用("台账/自动状态") as Promise<自动同步状态>,
    台账一致性检查: () => 调用("台账/一致性检查", true) as Promise<一致性报告>,
    /** 后端目前只接「确认」一个布尔：会按它当前的一致性清单一次补齐 */
    台账一致性补齐: (确认: boolean) => 调用("台账/一致性补齐", 确认 === true) as Promise<补齐结果>,
    /** 浏览器预览没有推送：轮询检查结果，数字一变就回调 */
    监听一致性: (回调: (事件: 一致性提示) => void) => {
      let 停 = false
      let 上次签 = ""
      const 看 = async () => {
        if (停) return
        try {
          const 报告 = (await 调用("台账/一致性检查")) as 一致性报告
          const 签 = 报告.问题数 + "|" + 报告.可补齐 + "|" + 报告.需裁定
          if (签 !== 上次签) {
            const 首个 = 上次签 === ""
            上次签 = 签
            if (!首个) 回调({ 问题数: 报告.问题数, 可补齐: 报告.可补齐, 需裁定: 报告.需裁定 })
          }
        } catch {
          /* 拿不到就等下一轮 */
        }
      }
      void 看()
      const 计时 = window.setInterval(() => void 看(), 2000)
      return () => {
        停 = true
        window.clearInterval(计时)
      }
    },
    台账立即同步: (章节号: number) => 调用("台账/立即同步", 章节号) as Promise<同步结果>,
    /** 浏览器预览没有 SSE 推送：轮询状态并在「正在跑 / 上次结果」变化时合成事件 */
    监听自动同步: (回调: (事件: 自动同步进度) => void) => {
      let 停 = false
      let 上次跑 = new Set<number>()
      let 上次签 = ""
      const 看 = async () => {
        if (停) return
        try {
          const 状态 = (await 调用("台账/自动状态")) as 自动同步状态
          const 跑 = new Set(状态.正在跑 ?? [])
          for (const 章号 of 跑) if (!上次跑.has(章号)) 回调({ 章号, 阶段: "开始", 说明: "开始同步" })
          for (const 章号 of 上次跑) {
            if (跑.has(章号)) continue
            const 上次 = 状态.上次?.[String(章号)]
            if (!上次) continue
            回调({ 章号, 阶段: 上次.成功 ? "完成" : "失败", 说明: 上次.说明, 用量: 上次.用量 })
          }
          上次跑 = 跑
          上次签 = JSON.stringify(状态.上次 ?? {})
        } catch {
          /* 状态拿不到就等下一轮 */
        }
      }
      const 计时 = window.setInterval(() => void 看(), 1500)
      void 看()
      return () => {
        停 = true
        window.clearInterval(计时)
        void 上次签
      }
    },
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
