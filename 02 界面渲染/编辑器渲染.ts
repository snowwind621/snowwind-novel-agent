// 只负责一件事：把一章 Markdown 正文渲染成安全的 HTML 字符串（先整体转义，再认语法）。

const 转义表: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

/** 渲染前一律先过这一道：正文里出现的任何标签都只能是文字。 */
export function 转义(文本: string): string {
  return 文本.replace(/[&<>"']/g, (字) => 转义表[字] ?? 字)
}

/** 链接只放行 http(s)、mailto、页内锚点和站内相对路径，别的协议（javascript: 之类）直接不认。 */
function 安全地址(地址: string): string {
  const 址 = 地址.trim()
  const 小写 = 址.toLowerCase()
  if (/^https?:\/\//.test(小写) || 小写.startsWith("mailto:") || 小写.startsWith("#")) return 址
  if (/^[a-z][a-z0-9+.-]*:/.test(小写)) return ""
  return 址
}

// 行内语法，顺序就是优先级：行内代码 > 链接 > 粗体 > 删除线 > 斜体。
const 行内式 = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^\n]+?)~~|\*([^*\n]+?)\*|_([^_\n]+?)_/g

function 行内(已转义: string, 深 = 0): string {
  if (深 > 2) return 已转义
  return 已转义.replace(行内式, (整段, 码, 链接字, 链接址, 粗甲, 粗乙, 删, 斜甲, 斜乙) => {
    if (码 !== undefined) return "<code>" + 码 + "</code>"
    if (链接字 !== undefined) {
      const 址 = 安全地址(链接址 ?? "")
      const 内 = 行内(链接字, 深 + 1)
      return 址 ? '<a href="' + 址 + '" target="_blank" rel="noreferrer noopener">' + 内 + "</a>" : 内
    }
    if (粗甲 !== undefined) return "<strong>" + 行内(粗甲, 深 + 1) + "</strong>"
    if (粗乙 !== undefined) return "<strong>" + 行内(粗乙, 深 + 1) + "</strong>"
    if (删 !== undefined) return "<del>" + 行内(删, 深 + 1) + "</del>"
    if (斜甲 !== undefined) return "<em>" + 行内(斜甲, 深 + 1) + "</em>"
    if (斜乙 !== undefined) return "<em>" + 行内(斜乙, 深 + 1) + "</em>"
    return 整段
  })
}

/** 中文字体里行首那两个全角空格就是「首行缩进」，换算成 em 交给 CSS，文字本身不再带空格。
 *  富文本编辑模式下不能这么做：编辑区里的空格必须是真字符，否则用户删不掉、也回写不回源码。 */
function 渲染段落(原行: string, 缩进当文字: boolean): string {
  const 前导 = /^[\u3000 ]*/.exec(原行)?.[0] ?? ""
  const 文字 = 原行.slice(前导.length).replace(/\s+$/, "")
  if (缩进当文字) return "<p>" + 行内(转义(前导 + 文字)) + "</p>"
  const 全角 = (前导.match(/\u3000/g) ?? []).length
  const em = 全角 + (前导.length - 全角) * 0.5
  const 式 = em > 0 ? ' style="text-indent:' + em + 'em"' : ""
  return "<p" + 式 + ">" + 行内(转义(文字)) + "</p>"
}

function 拆格(行: string): string[] {
  return 行.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((格) => 格.trim())
}

interface 列表项 {
  层级: number
  有序: boolean
  文本: string
}

function 渲染列表(项们: 列表项[]): string {
  const 基 = 项们[0]?.层级 ?? 0
  const 出: string[] = []
  let 序 = 0
  while (序 < 项们.length) {
    const 首 = 项们[序]
    const 标签 = 首.有序 ? "ol" : "ul"
    const 条目: string[] = []
    while (序 < 项们.length && 项们[序].层级 - 基 <= 0 && 项们[序].有序 === 首.有序) {
      let 内 = 行内(转义(项们[序].文本))
      序++
      const 子们: 列表项[] = []
      while (序 < 项们.length && 项们[序].层级 - 基 > 0) {
        子们.push(项们[序])
        序++
      }
      if (子们.length > 0) {
        const 子标签 = 子们[0].有序 ? "ol" : "ul"
        内 += "<" + 子标签 + ">" + 子们.map((子) => "<li>" + 行内(转义(子.文本)) + "</li>").join("") + "</" + 子标签 + ">"
      }
      条目.push("<li>" + 内 + "</li>")
    }
    // 首项就是缩进的怪列表：按顶层出一组，免得死循环。
    if (条目.length === 0) {
      条目.push("<li>" + 行内(转义(首.文本)) + "</li>")
      序++
    }
    出.push("<" + 标签 + ">" + 条目.join("") + "</" + 标签 + ">")
  }
  return 出.join("\n")
}

export interface 渲染选项 {
  /** 富文本编辑区用：行首全角空格原样留在文字里，不用 CSS 缩进 */
  缩进当文字?: boolean
}

/** 唯一的出口：正文 Markdown → HTML。返回的 HTML 里所有文字都来自转义后的文本。 */
export function 渲染Markdown(源: string, 选项?: 渲染选项): string {
  const 缩进当文字 = Boolean(选项?.缩进当文字)
  const 行们 = String(源 ?? "").replace(/\r\n?/g, "\n").split("\n")
  const 出: string[] = []
  let 序 = 0
  while (序 < 行们.length) {
    const 行 = 行们[序]
    const 修剪 = 行.trim()
    if (修剪 === "") {
      序++
      continue
    }

    const 围栏 = /^```\s*([^\s`]*)\s*$/.exec(修剪)
    if (围栏) {
      const 语言 = 围栏[1]
      const 代码: string[] = []
      序++
      while (序 < 行们.length && !/^```\s*$/.test(行们[序].trim())) {
        代码.push(行们[序])
        序++
      }
      序++
      出.push(
        '<pre class="预览-代码块"><code' +
          (语言 ? ' class="语言-' + 转义(语言) + '"' : "") +
          ">" +
          转义(代码.join("\n")) +
          "</code></pre>",
      )
      continue
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(修剪)) {
      出.push("<hr />")
      序++
      continue
    }

    const 标题 = /^(#{1,6})\s+(.+)$/.exec(修剪)
    if (标题) {
      const 级 = 标题[1].length
      出.push("<h" + 级 + ">" + 行内(转义(标题[2].trim())) + "</h" + 级 + ">")
      序++
      continue
    }

    if (修剪.startsWith("|") && /^\|[\s:|-]+\|$/.test((行们[序 + 1] ?? "").trim())) {
      const 表头 = 拆格(行)
      序 += 2
      const 数据行: string[][] = []
      while (序 < 行们.length && 行们[序].trim().startsWith("|")) {
        数据行.push(拆格(行们[序]))
        序++
      }
      出.push(
        "<table><thead><tr>" +
          表头.map((格) => "<th>" + 行内(转义(格)) + "</th>").join("") +
          "</tr></thead><tbody>" +
          数据行
            .map(
              (格们) =>
                "<tr>" + 表头.map((_, 列) => "<td>" + 行内(转义(格们[列] ?? "")) + "</td>").join("") + "</tr>",
            )
            .join("") +
          "</tbody></table>",
      )
      continue
    }

    if (/^>\s?/.test(修剪)) {
      const 内里: string[] = []
      while (序 < 行们.length && /^>\s?/.test(行们[序].trim())) {
        内里.push(行们[序].trim().replace(/^>\s?/, ""))
        序++
      }
      出.push("<blockquote>" + 渲染Markdown(内里.join("\n")) + "</blockquote>")
      continue
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(行)) {
      const 项们: 列表项[] = []
      while (序 < 行们.length) {
        const 匹配 = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(行们[序])
        if (!匹配) break
        项们.push({
          层级: Math.floor(匹配[1].replace(/\t/g, "  ").length / 2),
          有序: /^\d/.test(匹配[2]),
          文本: 匹配[3],
        })
        序++
      }
      出.push(渲染列表(项们))
      continue
    }

    出.push(渲染段落(行, 缩进当文字))
    序++
  }
  return 出.join("\n")
}
// ────────────────────────── 富文本模式：DOM → Markdown 回写 ──────────────────────────

/** 行内节点的反向渲染：把 <strong>/<em>/<code>/<del>/<a> 还原成 Markdown 记号。 */
function 行内回写(节点: Node): string {
  if (节点.nodeType === 3) return (节点.textContent ?? "").replace(/\u00a0/g, " ")
  if (节点.nodeType !== 1) return ""
  const 元素 = 节点 as HTMLElement
  const 内 = Array.from(元素.childNodes).map(行内回写).join("")
  switch (元素.tagName) {
    case "STRONG":
    case "B":
      return 内.trim() ? "**" + 内 + "**" : 内
    case "EM":
    case "I":
      return 内.trim() ? "*" + 内 + "*" : 内
    case "DEL":
    case "S":
    case "STRIKE":
      return 内.trim() ? "~~" + 内 + "~~" : 内
    case "CODE":
      return 内 ? "`" + 内 + "`" : 内
    case "BR":
      return "\n"
    case "A": {
      const 址 = 元素.getAttribute("href") ?? ""
      return 址 && 内 ? "[" + 内 + "](" + 址 + ")" : 内
    }
    default:
      return 内
  }
}

function 取行们(文本: string): string[] {
  return 文本.replace(/\u00a0/g, " ").split("\n")
}

function 列表回写(列表: HTMLElement, 层: number): string[] {
  const 出: string[] = []
  const 有序 = 列表.tagName === "OL"
  let 序 = 0
  for (const 项 of Array.from(列表.children)) {
    if (项.tagName !== "LI") continue
    序++
    const 前缀 = "  ".repeat(Math.max(0, 层)) + (有序 ? 序 + ". " : "- ")
    const 子表 = Array.from(项.children).filter((子) => 子.tagName === "UL" || 子.tagName === "OL") as HTMLElement[]
    const 文字 = Array.from(项.childNodes)
      .filter((子) => !(子.nodeType === 1 && ["UL", "OL"].includes((子 as HTMLElement).tagName)))
      .map(行内回写)
      .join("")
      .replace(/\n+$/, "")
    出.push(前缀 + 文字)
    for (const 子 of 子表) 出.push(...列表回写(子, 层 + 1))
  }
  return 出
}

function 表格回写(表: HTMLElement): string[] {
  const 行们 = Array.from(表.querySelectorAll("tr")).map((行) =>
    Array.from(行.children).map((格) => 行内回写(格).replace(/\n+/g, " ").trim()),
  )
  if (行们.length === 0) return []
  const 头 = 行们[0]
  return [
    "| " + 头.join(" | ") + " |",
    "| " + 头.map(() => "---").join(" | ") + " |",
    ...行们.slice(1).map((行) => "| " + 头.map((_, 序) => 行[序] ?? "").join(" | ") + " |"),
  ]
}

/**
 * 富文本编辑区的反向渲染：DOM → Markdown。
 * 只做「认得自己渲染出来的那些标签」这一件事，认不出的标签一律当纯文本。
 * 换行符跟原稿保持一致（原稿是 CRLF 就还回 CRLF），免得改一个字整篇 diff。
 */
export function 取回Markdown(根: HTMLElement, 换行 = "\n"): string {
  const 行们: string[] = []
  const 收 = (节点: Node) => {
    if (节点.nodeType === 3) {
      for (const 行 of 取行们(节点.textContent ?? "")) 行们.push(行.replace(/\s+$/, ""))
      return
    }
    if (节点.nodeType !== 1) return
    const 元素 = 节点 as HTMLElement
    const 标签 = 元素.tagName
    if (/^H[1-6]$/.test(标签)) {
      行们.push("#".repeat(Number(标签[1])) + " " + 行内回写(元素).replace(/^[\u3000\s]+/, "").trim())
      return
    }
    if (标签 === "HR") {
      行们.push("---")
      return
    }
    if (标签 === "PRE") {
      行们.push("```")
      for (const 行 of 取行们(元素.textContent ?? "")) 行们.push(行)
      行们.push("```")
      return
    }
    if (标签 === "BLOCKQUOTE") {
      for (const 行 of 取回Markdown(元素, "\n").split("\n")) 行们.push(行 ? "> " + 行 : ">")
      return
    }
    if (标签 === "UL" || 标签 === "OL") {
      行们.push(...列表回写(元素, 0))
      return
    }
    if (标签 === "TABLE") {
      行们.push(...表格回写(元素))
      return
    }
    if (标签 === "P" || 标签 === "DIV" || 标签 === "SECTION" || 标签 === "ARTICLE" || 标签 === "LI") {
      for (const 行 of 取行们(行内回写(元素))) 行们.push(行.replace(/\s+$/, ""))
      // 空段落（<p><br></p>）留一个空行，段间空行不会被吞掉
      if (元素.childNodes.length === 0) 行们.push("")
      return
    }
    行们.push(行内回写(元素).replace(/\s+$/, ""))
  }
  for (const 子 of Array.from(根.childNodes)) 收(子)
  // 头尾的纯空行去掉；中间连续空行最多留一行
  const 收尾: string[] = []
  for (const 行 of 行们) {
    if (行 === "" && (收尾.length === 0 || 收尾[收尾.length - 1] === "")) continue
    收尾.push(行)
  }
  while (收尾.length > 0 && 收尾[收尾.length - 1] === "") 收尾.pop()
  return 收尾.join(换行)
}
