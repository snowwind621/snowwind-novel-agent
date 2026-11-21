// 只负责一件事：导出格式的名单、别名与「设置里的默认格式」——界面与主进程共用这一份。
import type { 书库设置 } from "../03 进程桥接/通道"

/** 设置里能当默认的三种（与 03 通道的「书库设置.导出格式」一致）。 */
export type 导出格式 = "docx" | "markdown" | "epub"

/** 实际能导出的四种后缀：多出来的 txt 永远可手动选，但不做默认。 */
export type 导出后缀 = 导出格式 | "txt"

export interface 导出选项 {
  值: 导出后缀
  名: string
  /** 传给 生成导出() 的参数（markdown → md） */
  生成参数: string
  /** 设置里能不能把它设成默认 */
  可设默认: boolean
}

/** 导出菜单的原始顺序：和界面上一直以来的排法一致。 */
export const 导出选项表: 导出选项[] = [
  { 值: "docx", 名: "Word（docx）", 生成参数: "docx", 可设默认: true },
  { 值: "markdown", 名: "Markdown", 生成参数: "md", 可设默认: true },
  { 值: "epub", 名: "EPUB 电子书", 生成参数: "epub", 可设默认: true },
  { 值: "txt", 名: "TXT 纯文本", 生成参数: "txt", 可设默认: false },
]

/** 设置里的默认导出格式；值不认识就回落到 docx（与默认设置一致）。 */
export function 默认导出格式(书库?: 书库设置 | null): 导出格式 {
  const 值 = String(书库?.导出格式 ?? "").trim()
  return 导出选项表.some((项) => 项.值 === 值 && 项.可设默认) ? (值 as 导出格式) : "docx"
}

/** 默认格式翻成 生成导出() 认的参数（markdown → md）。 */
export function 默认生成参数(书库?: 书库设置 | null): string {
  const 值 = 默认导出格式(书库)
  return 导出选项表.find((项) => 项.值 === 值)?.生成参数 ?? "docx"
}

/**
 * 导出菜单：默认那个排最前，并标上 默认: true。
 * 界面照这个渲染，「导出」下拉里排第一、带「默认」标记的就是设置里选的那个。
 */
export function 导出菜单(书库?: 书库设置 | null): Array<导出选项 & { 默认: boolean }> {
  const 默认 = 默认导出格式(书库)
  const 项们 = 导出选项表.map((项) => ({ ...项, 默认: 项.值 === 默认 }))
  return [...项们.filter((项) => 项.默认), ...项们.filter((项) => !项.默认)]
}
