// 只负责一件事：记录每个智能体干过什么，并让别的智能体能查到。
import fs from "node:fs"
import path from "node:path"

export interface 会话条 {
  时间: string
  智能体: string
  任务: string
  产出: string
  章节?: number
}

function 簿文件(数据目录: string, 书库路径: string): string {
  const 指纹 = Buffer.from(书库路径).toString("hex").slice(-24)
  const 目录 = path.join(数据目录, "会话")
  fs.mkdirSync(目录, { recursive: true })
  return path.join(目录, 指纹 + ".jsonl")
}

export function 记一笔(数据目录: string, 书库路径: string, 条: 会话条): void {
  fs.appendFileSync(簿文件(数据目录, 书库路径), JSON.stringify(条) + "\n", "utf8")
}

export function 读全部(数据目录: string, 书库路径: string): 会话条[] {
  const 文件 = 簿文件(数据目录, 书库路径)
  if (!fs.existsSync(文件)) return []
  return fs
    .readFileSync(文件, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((行) => {
      try {
        return JSON.parse(行) as 会话条
      } catch {
        return null
      }
    })
    .filter(Boolean) as 会话条[]
}

/** 跨智能体检索：谁最近在哪件事上说过什么。 */
export function 查相关(数据目录: string, 书库路径: string, 关键词: string[], 上限 = 6): 会话条[] {
  const 全部 = 读全部(数据目录, 书库路径)
  const 命中 = 全部.filter((条) => 关键词.some((词) => 词 && (条.任务.includes(词) || 条.产出.includes(词))))
  return 命中.slice(-上限)
}
