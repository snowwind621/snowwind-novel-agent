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

/** 中文字体里行首那两个全角空格就是「首行缩进」，换算成 em 交给 CSS，文字本身不再带空格。 */
function 渲染段落(原行: string): string {
  const 前导 = /^[\u3000 ]*/.exec(原行)?.[0] ?? ""
  const 全角 = (前导.match(/\u3000/g) ?? []).length
  const em = 全角 + (前导.length - 全角) * 0.5
  const 文字 = 原行.slice(前导.length).replace(/\s+$/, "")
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

/** 唯一的出口：正文 Markdown → HTML。返回的 HTML 里所有文字都来自转义后的文本。 */
export function 渲染Markdown(源: string): string {
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

    出.push(渲染段落(行))
    序++
  }
  return 出.join("\n")
}
