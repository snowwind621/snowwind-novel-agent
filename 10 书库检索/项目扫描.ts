// 只负责一件事：打开一个书库目录，产出「卷 → 章 → 字数」的目录树。
import path from "node:path"
import { 读文本, 列目录 } from "../11 文件工作区/原子写"
import { 解析主线束, 解析章文件名 } from "./主线束解析"
import type { 项目摘要, 卷组, 章节摘要 } from "../03 进程桥接/通道"

export function 计字数(正文: string): number {
  return 正文.replace(/\s/g, "").length
}

async function 读书名(根: string): Promise<string> {
  try {
    const 内容 = await 读文本(path.join(根, "project.yaml"))
    const 匹配 = /^title:\s*(.+)$/m.exec(内容)
    if (匹配) return 匹配[1].replace(/^["']|["']$/g, "").trim()
  } catch {
    /* project.yaml 缺失时退回目录名 */
  }
  return path.basename(根)
}

export async function 扫描项目(根: string): Promise<项目摘要> {
  const 书名 = await 读书名(根)
  const 束目录 = path.join(根, "manuscripts.binder")
  const 章文件表 = new Map<number, string>()
  for (const 项 of await 列目录(束目录)) {
    if (项.是目录) continue
    const 解析 = 解析章文件名(项.名称)
    if (解析) 章文件表.set(解析.编号, 项.名称)
  }

  let 卷结构 = 解析主线束(await 读文本(path.join(束目录, "binder.xml")).catch(() => ""))
  if (卷结构.length === 0) {
    卷结构 = [{ 卷号: 1, 章节号: [...章文件表.keys()].sort((a, b) => a - b) }]
  }

  const 卷: 卷组[] = []
  let 总字数 = 0
  let 最新章节 = 0
  for (const 组 of 卷结构) {
    const 章节: 章节摘要[] = []
    for (const 编号 of 组.章节号) {
      const 文件名 = 章文件表.get(编号)
      const 标题 = 文件名 ? (解析章文件名(文件名)?.标题 ?? "第" + 编号 + "章") : "（缺文件）"
      let 字数 = 0
      if (文件名) {
        const 正文 = await 读文本(path.join(束目录, 文件名)).catch(() => "")
        字数 = 计字数(正文)
        最新章节 = Math.max(最新章节, 编号)
      }
      总字数 += 字数
      章节.push({ 编号, 标题, 文件: 文件名 ?? "", 字数 })
    }
    卷.push({ 编号: 组.卷号, 章节 })
  }

  return {
    路径: 根,
    书名,
    卷,
    统计: { 章数: [...章文件表.keys()].length, 总字数, 最新章节 },
  }
}
