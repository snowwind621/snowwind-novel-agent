// 只负责一件事：为一次写入生成一个可回滚的 Git 提交，并在书库没初始化仓库时说清楚这件事。
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const 原执行 = promisify(execFile)

/**
 * 跑一条外部命令。
 * Windows 上不加 windowsHide，每调一次 git 就弹一个黑色 cmd 窗口；
 * 自动保存每次都要 add + commit，于是一按保存就连爆好几个窗口。
 */
const 执行 = (文件: string, 参数: string[], 选项: Record<string, unknown> = {}) =>
  原执行(文件, 参数, { windowsHide: true, ...选项 }) as Promise<{ stdout: string; stderr: string }>

export async function 是Git仓库(根目录: string): Promise<boolean> {
  try {
    await 执行("git", ["rev-parse", "--is-inside-work-tree"], { cwd: 根目录 })
    return true
  } catch {
    return false
  }
}

/** 书库没配全局身份时，用工程身份提交，避免「写了但没提交」。 */
async function 身份参数(根目录: string): Promise<string[]> {
  try {
    const { stdout } = await 执行("git", ["config", "user.email"], { cwd: 根目录 })
    if (stdout.trim()) return []
  } catch {
    /* 读不到就当没配 */
  }
  return ["-c", "user.name=雪风小说工坊", "-c", "user.email=workshop@snowwind.local"]
}

export interface 提交结果 {
  成功: boolean
  说明: string
  /** 这次没提交是因为书库压根不是 Git 仓库（界面据此给出「初始化」引导） */
  不是Git仓库?: boolean
}

export async function 提交(根目录: string, 说明: string, 相对文件: string[]): Promise<提交结果> {
  if (!(await 是Git仓库(根目录))) return { 成功: false, 说明: "该书库不是 Git 仓库，未提交", 不是Git仓库: true }
  try {
    const 身份 = await 身份参数(根目录)
    await 执行("git", ["add", "--", ...相对文件], { cwd: 根目录 })
    await 执行("git", [...身份, "commit", "-m", 说明, "--", ...相对文件], { cwd: 根目录 })
    return { 成功: true, 说明: "已提交 Git" }
  } catch (错误: any) {
    const 输出 = String(错误?.stderr ?? 错误?.message ?? 错误).trim()
    if (输出.includes("nothing to commit") || 输出.includes("没有")) return { 成功: true, 说明: "内容无变化，未新建提交" }
    return { 成功: false, 说明: "Git 未提交：" + 输出.split("\n")[0].slice(0, 160) }
  }
}

/**
 * 给书库建 Git 仓库：git init + 首次全量提交。
 * 只有作者在界面上点「初始化」才会走到这里——我们不替他做这个决定。
 */
export async function 初始化仓库(根目录: string): Promise<{ 成功: boolean; 说明: string }> {
  if (await 是Git仓库(根目录)) return { 成功: false, 说明: "这个书库已经是 Git 仓库了，不用再初始化" }
  try {
    await 执行("git", ["init"], { cwd: 根目录 })
    const 身份 = await 身份参数(根目录)
    await 执行("git", [...身份, "add", "-A"], { cwd: 根目录 })
    await 执行("git", [...身份, "commit", "-m", "初始化书库：把现有内容全部纳入版本管理", "--allow-empty"], { cwd: 根目录 })
    return { 成功: true, 说明: "已初始化 Git 仓库，并做了首次全量提交" }
  } catch (错误: any) {
    const 输出 = String(错误?.stderr ?? 错误?.message ?? 错误).trim()
    return { 成功: false, 说明: "初始化失败：" + 输出.split("\n")[0].slice(0, 160) }
  }
}
