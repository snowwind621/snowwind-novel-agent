// 只负责一件事：把一段文本安全地落到磁盘上（先写临时文件，再原子改名）。
import fs from "node:fs/promises"

export async function 读文本(路径: string): Promise<string> {
  return fs.readFile(路径, "utf8")
}

export async function 存在(路径: string): Promise<boolean> {
  try {
    await fs.access(路径)
    return true
  } catch {
    return false
  }
}

export async function 原子写文本(路径: string, 内容: string): Promise<void> {
  const 临时 = `${路径}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(临时, 内容, "utf8")
  await fs.rename(临时, 路径)
}

export async function 列目录(路径: string): Promise<Array<{ 名称: string; 是目录: boolean }>> {
  const 项 = await fs.readdir(路径, { withFileTypes: true })
  return 项.map((x) => ({ 名称: x.name, 是目录: x.isDirectory() }))
}
