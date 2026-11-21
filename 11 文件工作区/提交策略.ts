// 只负责一件事：决定「这一次保存要不要顺手 git 提交」——写盘便宜，起 git 进程贵（实测一次约 140ms）。
import { 提交, 是Git仓库 } from "./Git提交"

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

export interface 提交决定 {
  该提交: boolean
  原因: "手动" | "首次" | "间隔到" | "内容没变" | "间隔未到" | "不是仓库"
}

export async function 该不该提交(书库: string, 正文: string, 立即: boolean): Promise<提交决定> {
  if (!(await 是仓库(书库))) return { 该提交: false, 原因: "不是仓库" }
  const 上次 = 上次提交时刻.get(书库) ?? 0
  if (指纹(正文) === 上次内容.get(书库)) return { 该提交: false, 原因: "内容没变" }
  if (立即) return { 该提交: true, 原因: "手动" }
  if (上次 === 0) return { 该提交: true, 原因: "首次" }
  if (Date.now() - 上次 >= 自动提交最小间隔毫秒) return { 该提交: true, 原因: "间隔到" }
  return { 该提交: false, 原因: "间隔未到" }
}

export function 记下提交(书库: string, 正文: string): void {
  上次提交时刻.set(书库, Date.now())
  上次内容.set(书库, 指纹(正文))
}

export { 提交 }