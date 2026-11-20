// 只负责一件事：打开一本「雪风卷宗」，产出「卷 → 章 → 字数」的目录树。
import path from "node:path"
import { 读文本, 列目录 } from "../11 文件工作区/原子写"
import { 路径, 解析卷目录, 解析章文件名, 读清单 } from "./书库布局"
import type { 项目摘要, 卷组, 章节摘要 } from "../03 进程桥接/通道"

export function 计字数(正文: string): number {
  return 正文.replace(/\s/g, "").length
}

export async function 扫描项目(根: string): Promise<项目摘要> {
  const 清单文本 = await 读文本(path.join(根, 路径.清单)).catch(() => "")
  const 清单 = 读清单(清单文本)
  const 书名 = 清单.书名 || path.basename(根)

  const 正文根 = path.join(根, 路径.正文)
  const 卷们: 卷组[] = []
  let 总字数 = 0
  let 最新章节 = 0
  let 章数 = 0

  for (const 卷目录 of await 列目录(正文根).catch(() => [])) {
    if (!卷目录.是目录) continue
    const 卷号 = 解析卷目录(卷目录.名称)
    if (卷号 === null) continue

    const 章节: 章节摘要[] = []
    const 章目录 = path.join(正文根, 卷目录.名称)
    for (const 项 of await 列目录(章目录)) {
      if (项.是目录) continue
      const 解析 = 解析章文件名(项.名称)
      if (!解析) continue
      const 相对 = 路径.正文 + "/" + 卷目录.名称 + "/" + 项.名称
      const 正文 = await 读文本(path.join(根, 相对)).catch(() => "")
      const 字数 = 计字数(正文)
      总字数 += 字数
      章数++
      最新章节 = Math.max(最新章节, 解析.编号)
      章节.push({ 编号: 解析.编号, 标题: 解析.标题, 文件: 相对, 字数 })
    }
    if (章节.length > 0) {
      章节.sort((甲, 乙) => 甲.编号 - 乙.编号)
      卷们.push({ 编号: 卷号, 章节 })
    }
  }

  卷们.sort((甲, 乙) => 甲.编号 - 乙.编号)
  return { 路径: 根, 书名, 卷: 卷们, 统计: { 章数, 总字数, 最新章节 } }
}
