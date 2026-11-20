// 只负责一件事：把台账与面板镜像拼成界面要显示的那块看板。
import path from "node:path"
import { 读文本, 列目录 } from "../11 文件工作区/原子写"
import { 解析承诺台账 } from "./台账解析"
import { 合并伏笔, 读面板伏笔, 排序伏笔, 汇总伏笔, 面板伏笔 } from "../07 设定档案/伏笔模型"
import { 路径, 台账册 } from "./书库布局"
import type { 看板数据, 台账卡 } from "../03 进程桥接/通道"

export async function 装配看板(根: string, 最新章节: number): Promise<看板数据> {
  const 承诺正文 = await 读文本(path.join(根, 台账册.承诺台账)).catch(() => "")
  const 承诺 = 解析承诺台账(承诺正文)

  let 面板映射 = new Map<string, 面板伏笔>()
  try {
    const 镜像 = JSON.parse(await 读文本(path.join(根, 路径.面板镜像)))
    面板映射 = 读面板伏笔(镜像)
  } catch {
    /* 没有面板镜像时，只用承诺台账 */
  }

  const 伏笔 = 排序伏笔(合并伏笔(承诺, 面板映射, 最新章节))
  return { 最新章节, 伏笔, 统计: 汇总伏笔(伏笔), 台账: await 列台账(根) }
}

async function 列台账(根: string): Promise<台账卡[]> {
  const 目录 = path.join(根, 路径.台账)
  const 卡: 台账卡[] = []
  for (const 项 of await 列目录(目录).catch(() => [])) {
    if (项.是目录 || !项.名称.endsWith(".md")) continue
    const 正文 = await 读文本(path.join(目录, 项.名称)).catch(() => "")
    const 行们 = 正文.split(/\r?\n/)
    const 摘录 = 行们.find((行) => 行.trim().startsWith("|")) ?? 行们.find((行) => 行.trim().length > 0 && !行.startsWith("---") && !行.startsWith("书名:")) ?? ""
    卡.push({ 名称: 项.名称.replace(/\.md$/, ""), 相对路径: 路径.台账 + "/" + 项.名称, 行数: 行们.length, 摘录: 摘录.slice(0, 120) })
  }
  return 卡.sort((甲, 乙) => 甲.名称.localeCompare(乙.名称, "zh"))
}
