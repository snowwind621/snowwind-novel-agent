// 只负责一件事：为一次写入生成一个可回滚的 Git 提交。
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const 执行 = promisify(execFile)

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

export async function 提交(根目录: string, 说明: string, 相对文件: string[]): Promise<{ 成功: boolean; 说明: string }> {
  if (!(await 是Git仓库(根目录))) return { 成功: false, 说明: "该书库不是 Git 仓库，未提交" }
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
