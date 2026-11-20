// 只负责一件事：把整本书的章节变成 txt / markdown / docx / epub 四种文件。
import { 打ZIP } from "./压缩包"

export interface 章 {
  编号: number
  标题: string
  正文: string
}

export interface 成品 {
  文件名: string
  数据: Buffer
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

function 导Docx(书名: string, 章们: 章[]): 成品 {
  const 段落 = (文字: string, 样式?: string) =>
    "<w:p>" +
    (样式 ? "<w:pPr><w:pStyle w:val=\"" + 样式 + "\"/></w:pPr>" : "") +
    "<w:r><w:t xml:space=\"preserve\">" + 转义(文字) + "</w:t></w:r></w:p>"

  const 正文XML: string[] = [段落(书名, "Title")]
  for (const 章 of 章们) {
    正文XML.push(段落("第 " + 章.编号 + " 章　" + 章.标题, "Heading1"))
    for (const 行 of 段落们(章.正文)) 正文XML.push(段落("　　" + 行))
  }

  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    正文XML.join("") +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    "</w:body></w:document>"

  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>' +
    "</w:styles>"

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
    { 名称: "word/styles.xml", 数据: Buffer.from(styles, "utf8") },
    { 名称: "word/_rels/document.xml.rels", 数据: Buffer.from(文档关系, "utf8") },
  ])
  return { 文件名: 书名安全(书名) + ".docx", 数据 }
}

function 导EPUB(书名: string, 章们: 章[]): 成品 {
  const xhtml = (标题: string, 内容: string) =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>' +
    转义(标题) +
    "</title></head><body>" +
    内容 +
    "</body></html>"

  const 章节文件 = 章们.map((章, 序) => {
    const 名 = "ch" + String(序 + 1).padStart(3, "0") + ".xhtml"
    const 正文 = 段落们(章.正文).map((行) => "<p>　　" + 转义(行) + "</p>").join("")
    return { 名, 数据: xhtml("第 " + 章.编号 + " 章 " + 章.标题, "<h2>第 " + 章.编号 + " 章 " + 章.标题 + "</h2>" + 正文) }
  })

  const manifest = 章节文件.map((f, 序) => '<item id="c' + (序 + 1) + '" href="' + f.名 + '" media-type="application/xhtml+xml"/>').join("")
  const spine = 章节文件.map((_, 序) => '<itemref idref="c' + (序 + 1) + '"/>').join("")

  const opf = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="bookid">snowwind-' + Buffer.from(书名).toString("hex").slice(0, 16) + "</dc:identifier>" +
    "<dc:title>" + 转义(书名) + "</dc:title><dc:language>zh-CN</dc:language>" +
    "</metadata>" +
    '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' + manifest + "</manifest>" +
    '<spine><itemref idref="nav"/>' + spine + "</spine></package>"

  const nav条目 = 章节文件.map((f, 序) => '<li><a href="' + f.名 + '">第 ' + 章们[序].编号 + " 章 " + 转义(章们[序].标题) + "</a></li>").join("")
  const nav = xhtml("目录", "<h1>目录</h1><ol>" + nav条目 + "</ol>")

  const 容器 = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'

  const 数据 = 打ZIP([
    { 名称: "mimetype", 数据: Buffer.from("application/epub+zip", "utf8") },
    { 名称: "META-INF/container.xml", 数据: Buffer.from(容器, "utf8") },
    { 名称: "OEBPS/content.opf", 数据: Buffer.from(opf, "utf8") },
    { 名称: "OEBPS/nav.xhtml", 数据: Buffer.from(nav, "utf8") },
    ...章节文件.map((f) => ({ 名称: "OEBPS/" + f.名, 数据: Buffer.from(f.数据, "utf8") })),
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
