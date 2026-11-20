// 只负责一件事：把 Markdown 里的表格读成结构化行（台账全部靠它）。

export interface 表格 {
  标题: string
  表头: string[]
  行: string[][]
}

function 拆行(行: string): string[] {
  const 内容 = 行.replace(/^\|/, "").replace(/\|$/, "")
  return 内容.split("|").map((片段) => 片段.trim().replace(/<br\s*\/?>/gi, " "))
}

export function 解析表格(正文: string): 表格[] {
  const 行们 = 正文.split(/\r?\n/)
  const 表们: 表格[] = []
  let 标题 = ""
  for (let i = 0; i < 行们.length; i++) {
    const 行 = 行们[i].trim()
    if (行.startsWith("#")) {
      标题 = 行.replace(/^#+\s*/, "").trim()
      continue
    }
    if (!行.startsWith("|")) continue
    const 次行 = (行们[i + 1] ?? "").trim()
    if (!/^\|[\s:\-|]+\|$/.test(次行)) continue
    const 表头 = 拆行(行)
    const 数据行: string[][] = []
    let j = i + 2
    while (j < 行们.length && 行们[j].trim().startsWith("|")) {
      数据行.push(拆行(行们[j].trim()))
      j++
    }
    表们.push({ 标题, 表头, 行: 数据行 })
    i = j - 1
  }
  return 表们
}

export interface 承诺行 {
  编号: string
  名称: string
  埋: string
  兑: string
  备注: string
  /** 「参考间隔」是可选的台账列：没写就是 null（不按超期算，只按久置提醒）。 */
  参考间隔: number | null
  /** 「重要程度」「意图」也是可选列：没写回落 side / active，和旧镜像里的默认一致。 */
  重要程度: string
  意图: string
  小节: string
}

/** 可选列里的文字：去掉强调星号与空白，空串交给调用方回落默认值。 */
function 读文字(格: string): string {
  return 格.replace(/\*/g, "").trim()
}

/** 间隔格只认纯数字（允许带「章」）；空、破折号、别的字一律当没写。 */
function 读间隔(格: string): number | null {
  const 文本 = 格.replace(/[*\s]/g, "").replace(/章$/, "")
  return /^\d+$/.test(文本) ? Number(文本) : null
}

export function 解析承诺台账(正文: string): 承诺行[] {
  const 结果: 承诺行[] = []
  for (const 表 of 解析表格(正文)) {
    const 编号列 = 表.表头.findIndex((h) => h.includes("编号"))
    const 名称列 = 表.表头.findIndex((h) => h.includes("承诺"))
    if (编号列 < 0 || 名称列 < 0) continue
    const 埋列 = 表.表头.findIndex((h) => h === "埋" || h.includes("埋入"))
    const 兑列 = 表.表头.findIndex((h) => h === "兑" || h.includes("兑现"))
    const 备注列 = 表.表头.findIndex((h) => h.includes("兑了什么") || h.includes("现状态"))
    const 间隔列 = 表.表头.findIndex((h) => h.includes("参考间隔"))
    const 程度列 = 表.表头.findIndex((h) => h.includes("重要程度"))
    const 意图列 = 表.表头.findIndex((h) => h.includes("意图"))
    for (const 行 of 表.行) {
      const 编号 = (行[编号列] ?? "").replace(/\*/g, "").trim()
      if (!/^p-\d+/.test(编号)) continue
      结果.push({
        编号,
        名称: (行[名称列] ?? "").replace(/\*/g, "").trim(),
        埋: 埋列 >= 0 ? (行[埋列] ?? "").trim() : "",
        兑: 兑列 >= 0 ? (行[兑列] ?? "").trim() : "",
        备注: 备注列 >= 0 ? (行[备注列] ?? "").trim() : "",
        参考间隔: 读间隔(间隔列 >= 0 ? (行[间隔列] ?? "") : ""),
        重要程度: 读文字(程度列 >= 0 ? (行[程度列] ?? "") : "") || "side",
        意图: 读文字(意图列 >= 0 ? (行[意图列] ?? "") : "") || "active",
        小节: 表.标题,
      })
    }
  }
  return 结果
}

export function 取首个章号(文本: string): number | null {
  const 匹配 = /ch\s*(\d+)/i.exec(文本)
  return 匹配 ? Number(匹配[1]) : null
}

export function 取全部章号(文本: string): number[] {
  const 出: number[] = []
  const 正则 = /ch\s*(\d+)/gi
  let 匹配: RegExpExecArray | null
  while ((匹配 = 正则.exec(文本)) !== null) 出.push(Number(匹配[1]))
  return 出
}
