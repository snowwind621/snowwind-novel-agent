// 只负责一件事：跟 OpenAI 兼容网关说话（取模型清单、流式收字）。
export interface 流式参数 {
  基址: string
  密钥: string
  模型: string
  消息: Array<{ role: "system" | "user" | "assistant"; content: string }>
  温度?: number
  最大词元?: number
  信号?: AbortSignal
  回调: (类型: "思考" | "正文", 文本: string) => void
}

export async function 拉模型清单(基址: string, 密钥: string): Promise<string[]> {
  const 响应 = await fetch(基址.replace(/\/$/, "") + "/models", {
    headers: { Authorization: "Bearer " + 密钥 },
    signal: AbortSignal.timeout(15000),
  })
  if (!响应.ok) throw new Error("取模型清单失败：" + 响应.status)
  const 数据 = await 响应.json()
  const 列表 = Array.isArray(数据?.data) ? 数据.data : []
  return 列表.map((项: any) => String(项?.id ?? "")).filter(Boolean)
}

export async function 流式对话(参数: 流式参数): Promise<string> {
  const 响应 = await fetch(参数.基址.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + 参数.密钥 },
    body: JSON.stringify({
      model: 参数.模型,
      messages: 参数.消息,
      stream: true,
      temperature: 参数.温度 ?? 0.9,
      max_tokens: 参数.最大词元 ?? 4096,
    }),
    signal: 参数.信号,
  })
  if (!响应.ok || !响应.body) {
    const 详情 = await 响应.text().catch(() => "")
    throw new Error("网关返回 " + 响应.status + " " + 详情.slice(0, 200))
  }

  const 阅读器 = 响应.body.getReader()
  const 解码器 = new TextDecoder()
  let 缓冲 = ""
  let 全文 = ""

  for (;;) {
    const { value, done } = await 阅读器.read()
    if (done) break
    缓冲 += 解码器.decode(value, { stream: true })
    const 行们 = 缓冲.split("\n")
    缓冲 = 行们.pop() ?? ""
    for (const 行 of 行们) {
      const 修剪 = 行.trim()
      if (!修剪.startsWith("data:")) continue
      const 数据 = 修剪.slice(5).trim()
      if (!数据 || 数据 === "[DONE]") continue
      try {
        const 片段 = JSON.parse(数据)
        const 增量 = 片段?.choices?.[0]?.delta ?? {}
        if (增量.reasoning_content) 参数.回调("思考", String(增量.reasoning_content))
        if (增量.content) {
          全文 += String(增量.content)
          参数.回调("正文", String(增量.content))
        }
      } catch {
        /* 心跳行与不完整分片直接跳过 */
      }
    }
  }
  return 全文
}
