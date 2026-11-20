// 只负责一件事：把发生过的事追加成不可改写的日志（谁、何时、对哪一章、做了什么）。
import fs from "node:fs"
import path from "node:path"

export interface 黑板事件 {
  时间: string
  类型: string
  章节?: number
  发起者: string
  摘要: string
  细节?: Record<string, unknown>
}

function 日志文件(数据目录: string, 书库路径: string): string {
  const 指纹 = Buffer.from(书库路径).toString("hex").slice(-24)
  const 目录 = path.join(数据目录, "黑板")
  fs.mkdirSync(目录, { recursive: true })
  return path.join(目录, 指纹 + ".jsonl")
}

export function 记事件(数据目录: string, 书库路径: string, 事件: 黑板事件): void {
  fs.appendFileSync(日志文件(数据目录, 书库路径), JSON.stringify(事件) + "\n", "utf8")
}

export function 读事件(数据目录: string, 书库路径: string, 条数 = 200): 黑板事件[] {
  const 文件路径 = 日志文件(数据目录, 书库路径)
  if (!fs.existsSync(文件路径)) return []
  return fs
    .readFileSync(文件路径, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-条数)
    .map((行) => {
      try {
        return JSON.parse(行) as 黑板事件
      } catch {
        return null
      }
    })
    .filter(Boolean) as 黑板事件[]
}
