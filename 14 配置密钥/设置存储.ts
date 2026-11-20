// 只负责一件事：读写用户设置（网关、密钥、模型分工、上次打开的书）。
import fs from "node:fs"
import path from "node:path"
import type { 设置 } from "../03 进程桥接/通道"

export const 默认设置: 设置 = {
  网关地址: "http://127.0.0.1:3065/v1",
  API密钥: "",
  分工: { 总编: "cnwrokbuddy-ds", 执笔: "cnwrokbuddy-ds", 审校: "cnwrokbuddy-ds", 助手: "cnwrokbuddy-ds" },
  项目路径: "",
}

function 文件(数据目录: string): string {
  return path.join(数据目录, "设置.json")
}

export function 读设置(数据目录: string): 设置 {
  try {
    const 原始 = JSON.parse(fs.readFileSync(文件(数据目录), "utf8")) as Partial<设置>
    return { ...默认设置, ...原始, 分工: { ...默认设置.分工, ...(原始.分工 ?? {}) } }
  } catch {
    return { ...默认设置 }
  }
}

export function 写设置(数据目录: string, 新设置: 设置): 设置 {
  const 合并: 设置 = { ...默认设置, ...新设置, 分工: { ...默认设置.分工, ...(新设置.分工 ?? {}) } }
  fs.mkdirSync(数据目录, { recursive: true })
  fs.writeFileSync(文件(数据目录), JSON.stringify(合并, null, 2), "utf8")
  return 合并
}
