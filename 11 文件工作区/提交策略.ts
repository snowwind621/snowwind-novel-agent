// 只负责一件事：决定「这一次保存要不要顺手 git 提交」——写盘便宜，起 git 进程贵（实测一次约 140ms）。
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { 提交, 是Git仓库 } from "./Git提交"
import { 读设置 } from "../14 配置密钥/设置存储"

/** 快速保存时，两次自动提交之间至少隔这么久；手动保存 / 切标签不受限制。 */
export const 自动提交最小间隔毫秒 = 20000

const 上次提交时刻 = new Map<string, number>()
const 上次内容 = new Map<string, string>()
const 仓库缓存 = new Map<string, boolean>()

/** 便宜的内容指纹：长度 + 首尾片段，够判断「这次有没有真的改字」。 */
export function 指纹(正文: string): string {
  return 正文.length + ":" + 正文.slice(0, 64) + ":" + 正文.slice(-64)
}

/** 是不是 Git 仓库：结论按书库缓存，避免每次保存都起一个 git 进程（实测 46ms）。 */
export async function 是仓库(书库: string): Promise<boolean> {
  const 缓存 = 仓库缓存.get(书库)
  if (缓存 !== undefined) return 缓存
  const 结论 = await 是Git仓库(书库)
 仓库缓存.set(书库, 结论)
  return 结论
}

/**
 * 真跑在 Electron 里时，userData 就是唯一权威的答案——打包后的 productName 会改目录名，
 * 靠拼路径猜不可靠。不在 Electron 里（自检 / 浏览器预览）就返回空串。
 */
function 电子数据目录(): string {
  try {
    const 电子 = typeof require === "function" ? (require as any)("electron") : null
    const 应用 = 电子 && 电子.app
    const 值 = 应用 && typeof 应用.getPath === "function" ? 应用.getPath("userData") : ""
    return typeof 值 === "string" ? 值 : ""
  } catch {
    return ""
  }
}

/**
 * 设置.json 可能落在哪：先看环境变量（自检/自定义用），再看 Electron 的 userData，
 * 然后是各平台默认目录，最后看浏览器预览用的 ~/.雪风小说工坊。
 */
export function 数据目录候选(): string[] {
  const 出: string[] = []
  const 指定 = String(process.env.SNOWWIND_DATA_DIR ?? "").trim()
  if (指定) 出.push(指定)
  const 电子 = 电子数据目录()
  if (电子) 出.push(电子)
  const 应用名 = "snowwind-novel-agent"
  if (process.env.APPDATA) 出.push(path.join(process.env.APPDATA, 应用名))
  if (process.platform === "darwin") 出.push(path.join(os.homedir(), "Library", "Application Support", 应用名))
  if (process.platform === "linux") 出.push(path.join(os.homedir(), ".config", 应用名))
  出.push(path.join(os.homedir(), ".雪风小说工坊"))
  return 出
}

let 记住的数据目录: string | null = null

/** 找到真正有 设置.json 的那个数据目录；一个都没有就返回 null（按默认值走）。 */
export function 找数据目录(): string | null {
  if (记住的数据目录) {
    if (fs.existsSync(path.join(记住的数据目录, "设置.json"))) return 记住的数据目录
    记住的数据目录 = null
  }
  for (const 候选 of 数据目录候选()) {
    try {
      if (fs.existsSync(path.join(候选, "设置.json"))) {
        记住的数据目录 = 候选
        return 候选
      }
    } catch {
      /* 没权限就当没有 */
    }
  }
  return null
}

let 开关缓存: { 时刻: number; 值: boolean } | null = null

/**
 * 「编辑器.自动Git」：关掉之后自动保存只写盘，手动保存（Ctrl+S / 切标签）照样提交。
 * 主进程没把数据目录递到这里，所以自己找设置文件；按 mtime 缓存，改完设置下一次保存就生效。
 */
export function 自动提交开着(): boolean {
  const 目录 = 找数据目录()
  if (!目录) return true
  try {
    const 文件 = path.join(目录, "设置.json")
    const 时刻 = fs.statSync(文件).mtimeMs
    if (开关缓存 && 开关缓存.时刻 === 时刻) return 开关缓存.值
    const 值 = 读设置(目录).编辑器.自动Git !== false
    开关缓存 = { 时刻, 值 }
    return 值
  } catch {
    return true
  }
}

export interface 提交决定 {
  该提交: boolean
  原因: "手动" | "首次" | "间隔到" | "内容没变" | "间隔未到" | "不是仓库" | "自动提交已关"
}

export async function 该不该提交(书库: string, 正文: string, 立即: boolean): Promise<提交决定> {
  if (!(await 是仓库(书库))) return { 该提交: false, 原因: "不是仓库" }
  const 上次 = 上次提交时刻.get(书库) ?? 0
  if (指纹(正文) === 上次内容.get(书库)) return { 该提交: false, 原因: "内容没变" }
  // 手动保存（Ctrl+S / 切标签）不受「自动Git」开关影响：用户亲手按的，就该落一个提交
  if (立即) return { 该提交: true, 原因: "手动" }
  if (!自动提交开着()) return { 该提交: false, 原因: "自动提交已关" }
  if (上次 === 0) return { 该提交: true, 原因: "首次" }
  if (Date.now() - 上次 >= 自动提交最小间隔毫秒) return { 该提交: true, 原因: "间隔到" }
  return { 该提交: false, 原因: "间隔未到" }
}

export function 记下提交(书库: string, 正文: string): void {
  上次提交时刻.set(书库, Date.now())
  上次内容.set(书库, 指纹(正文))
}

export { 提交 }