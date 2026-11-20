// 只负责一件事：把整本书的章节变成 txt / markdown / docx / epub 四种文件。
import { 打ZIP } from "./压缩包"

export interface 章 {
  编号: number
  标题: string
  正文: string
  /** 可选卷号：每一章都给了卷号，docx 才会另起卷标题页、EPUB 目录才会分两级。 */
  卷号?: number
  /** 可选卷名，不给就写「第 N 卷」。 */
  卷名?: string
}

export interface 成品 {
  文件名: string
  数据: Buffer
}

interface 卷 {
  号: number
  名: string
  章们: 章[]
}

function 转义(文本: string): string {
  return 文本.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function 段落们(正文: string): string[] {
  return 正文
    .split(/\r?\n/)
    .map((行) => 行.replace(/^[\s\u3000]+/, "").trimEnd())
    .filter((行) => 行.length > 0)
}

function 书名安全(书名: string): string {
  return 书名.replace(/[\\/:*?"<>|]/g, "_")
}

/** 每章都带卷号才分卷；缺一个就返回 null，排版退化成不分卷。 */
function 分卷(章们: 章[]): 卷[] | null {
  if (章们.length === 0) return null
  if (!章们.every((章) => typeof 章.卷号 === "number")) return null
  const 表 = new Map<number, 卷>()
  for (const 章 of 章们) {
    const 号 = typeof 章.卷号 === "number" ? 章.卷号 : 0
    let 组 = 表.get(号)
    if (!组) {
      组 = { 号, 名: "", 章们: [] }
      表.set(号, 组)
    }
    if (!组.名) 组.名 = (章.卷名 ?? "").trim() || "第 " + 号 + " 卷"
    组.章们.push(章)
  }
  return Array.from(表.values()).sort((甲, 乙) => 甲.号 - 乙.号)
}

function 导TXT(书名: string, 章们: 章[]): 成品 {
  const 段 = [书名, ""]
  for (const 章 of 章们) {
    段.push("第 " + 章.编号 + " 章　" + 章.标题, "", 章.正文.trim(), "")
  }
  return { 文件名: 书名安全(书名) + ".txt", 数据: Buffer.from(段.join("\r\n"), "utf8") }
}

function 导Markdown(书名: string, 章们: 章[]): 成品 {
  const 段 = ["# " + 书名, ""]
  for (const 章 of 章们) {
    段.push("## 第 " + 章.编号 + " 章　" + 章.标题, "", 章.正文.trim(), "")
  }
  return { 文件名: 书名安全(书名) + ".md", 数据: Buffer.from(段.join("\n"), "utf8") }
}

// 只描一次样式表：正文靠 Normal 管首行缩进与行距，标题只改字号与居中。
const DOCX样式 = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
  "<w:docDefaults>",
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>',
  '<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
  "</w:docDefaults>",
  // Normal：中文正文——首行缩进 2 字符（w:firstLineChars="200"）、1.5 倍行距、两端对齐
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>',
  '<w:pPr><w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/></w:pPr>',
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>',
  "</w:style>",
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>',
  '<w:pPr><w:spacing w:before="2400" w:after="600" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0" w:firstLineChars="0"/><w:jc w:val="center"/></w:pPr>',
  '<w:rPr><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>',
  '<w:pPr><w:spacing w:before="480" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0" w:firstLineChars="0"/><w:jc w:val="center"/></w:pPr>',
  '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>',
  // VolumeTitle：卷标题页，pageBreakBefore 保证每卷都从新一页起
  '<w:style w:type="paragraph" w:styleId="VolumeTitle"><w:name w:val="Volume Title"/><w:basedOn w:val="Normal"/><w:qFormat/>',
  '<w:pPr><w:pageBreakBefore/><w:spacing w:before="2400" w:after="600" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0" w:firstLineChars="0"/><w:jc w:val="center"/></w:pPr>',
  '<w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>',
  "</w:styles>",
].join("")

function 导Docx(书名: string, 章们: 章[]): 成品 {
  const 标题段 = (文字: string, 样式: string) =>
    "<w:p><w:pPr><w:pStyle w:val=\"" + 样式 + "\"/></w:pPr>" +
    "<w:r><w:t xml:space=\"preserve\">" + 转义(文字) + "</w:t></w:r></w:p>"

  // 正文段把首行缩进直接写进 pPr：styles.xml 的 Normal 已经有同款缩进，
  // 这里再写一遍是为了让 document.xml 单看也成立（不吃样式的阅读器也不丢缩进）。
  const 正文段 = (文字: string) =>
    "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/>" +
    "<w:ind w:firstLineChars=\"200\" w:firstLine=\"480\"/></w:pPr>" +
    "<w:r><w:t xml:space=\"preserve\">" + 转义(文字) + "</w:t></w:r></w:p>"

  const 铺章 = (章: 章) => {
    正文XML.push(标题段("第 " + 章.编号 + " 章　" + 章.标题, "Heading1"))
    for (const 行 of 段落们(章.正文)) 正文XML.push(正文段(行))
  }
  const 正文XML: string[] = [标题段(书名, "Title")]
  const 卷表 = 分卷(章们)
  if (卷表) {
    for (const 卷项 of 卷表) {
      正文XML.push(标题段(卷项.名, "VolumeTitle"))
      for (const 章 of 卷项.章们) 铺章(章)
    }
  } else {
    for (const 章 of 章们) 铺章(章)
  }

  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    正文XML.join("") +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    "</w:body></w:document>"

  const 内容类型 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    "</Types>"

  const 关系 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>"

  const 文档关系 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>"

  const 数据 = 打ZIP([
    { 名称: "[Content_Types].xml", 数据: Buffer.from(内容类型, "utf8") },
    { 名称: "_rels/.rels", 数据: Buffer.from(关系, "utf8") },
    { 名称: "word/document.xml", 数据: Buffer.from(document, "utf8") },
    { 名称: "word/styles.xml", 数据: Buffer.from(DOCX样式, "utf8") },
    { 名称: "word/_rels/document.xml.rels", 数据: Buffer.from(文档关系, "utf8") },
  ])
  return { 文件名: 书名安全(书名) + ".docx", 数据 }
}

// EPUB 的排版全在这张表里：中文行高 1.75、首行缩进 2em、段间 0.75em。
const EPUB样式 = [
  "body { margin: 0 6%; line-height: 1.75; color: #1a1a1a;",
  '  font-family: "Songti SC", "SimSun", "Noto Serif CJK SC", serif; }',
  "h1, h2 { margin: 1.6em 0 1em; text-align: center; font-weight: bold; line-height: 1.4;",
  "  page-break-after: avoid; }",
  "h1 { font-size: 1.6em; }",
  "h2 { font-size: 1.25em; }",
  "p { margin: 0 0 0.75em 0; text-indent: 2em; text-align: justify; line-height: 1.75; }",
  "nav ol { padding-left: 1.4em; }",
  "nav a { text-decoration: none; }",
].join("\n")

function 导EPUB(书名: string, 章们: 章[]): 成品 {
  const xhtml = (标题: string, 内容: string) =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">' +
    '<head><meta charset="utf-8"/><title>' + 转义(标题) + "</title>" +
    '<link rel="stylesheet" type="text/css" href="style.css"/></head><body>' +
    内容 +
    "</body></html>"

  const 章页 = 章们.map((章, 序) => {
    const 名 = "ch" + String(序 + 1).padStart(3, "0") + ".xhtml"
    const 标题 = "第 " + 章.编号 + " 章 " + 章.标题
    const 正文 = 段落们(章.正文).map((行) => "<p>" + 转义(行) + "</p>").join("")
    return { 章, 名, 数据: xhtml(标题, "<h2>" + 转义(标题) + "</h2>" + 正文) }
  })

  const 链接 = (页: { 名: string; 章: 章 }) =>
    '<li><a href="' + 页.名 + '">第 ' + 页.章.编号 + " 章 " + 转义(页.章.标题) + "</a></li>"

  // 有卷信息就两级目录：卷名不跳转（span），卷下挂本章各章。
  const 卷表 = 分卷(章们)
  let 目录条 = ""
  if (卷表) {
    const 按章 = new Map<章, { 名: string; 章: 章 }>()
    for (const 页 of 章页) 按章.set(页.章, 页)
    目录条 = 卷表
      .map((卷项) => {
        const 子项 = 卷项.章们.map((章) => 链接(按章.get(章) as { 名: string; 章: 章 })).join("")
        return "<li><span>" + 转义(卷项.名) + "</span><ol>" + 子项 + "</ol></li>"
      })
      .join("")
  } else {
    目录条 = 章页.map((页) => 链接(页)).join("")
  }

  const manifest = 章页.map((f, 序) => '<item id="c' + (序 + 1) + '" href="' + f.名 + '" media-type="application/xhtml+xml"/>').join("")
  const spine = 章页.map((_, 序) => '<itemref idref="c' + (序 + 1) + '"/>').join("")

  const opf = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="bookid">snowwind-' + Buffer.from(书名).toString("hex").slice(0, 16) + "</dc:identifier>" +
    "<dc:title>" + 转义(书名) + "</dc:title><dc:language>zh-CN</dc:language>" +
    "</metadata>" +
    '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="style" href="style.css" media-type="text/css"/>' +
    manifest + "</manifest>" +
    '<spine><itemref idref="nav"/>' + spine + "</spine></package>"

  const nav = xhtml("目录", '<nav epub:type="toc" id="toc"><h1>目录</h1><ol>' + 目录条 + "</ol></nav>")

  const 容器 = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'

  const 数据 = 打ZIP([
    { 名称: "mimetype", 数据: Buffer.from("application/epub+zip", "utf8") },
    { 名称: "META-INF/container.xml", 数据: Buffer.from(容器, "utf8") },
    { 名称: "OEBPS/content.opf", 数据: Buffer.from(opf, "utf8") },
    { 名称: "OEBPS/nav.xhtml", 数据: Buffer.from(nav, "utf8") },
    { 名称: "OEBPS/style.css", 数据: Buffer.from(EPUB样式, "utf8") },
    ...章页.map((f) => ({ 名称: "OEBPS/" + f.名, 数据: Buffer.from(f.数据, "utf8") })),
  ])
  return { 文件名: 书名安全(书名) + ".epub", 数据 }
}

export function 生成导出(格式: string, 书名: string, 章们: 章[]): 成品 {
  switch (格式) {
    case "txt":
      return 导TXT(书名, 章们)
    case "md":
      return 导Markdown(书名, 章们)
    case "docx":
      return 导Docx(书名, 章们)
    case "epub":
      return 导EPUB(书名, 章们)
    default:
      throw new Error("不支持的格式：" + 格式)
  }
}
