// 只负责一件事：在书库副本上跑一次派活，验证结果确实归档进讨论区。
import { 创建请求处理 } from "../01 应用外壳/请求处理"
import { 读文本 } from "../11 文件工作区/原子写"
import path from "node:path"

const 副本 = process.argv[2]
const 数据目录 = (process.env.APPDATA ?? "") + "\\snowwind-novel-agent"

async function 主() {
  const 处理器 = 创建请求处理(数据目录)
  await 处理器.处理["项目/打开"](副本)
  const 进度: string[] = []
  const 结果 = await 处理器.派活("一句话说第 28 章开场该写什么", 27, (事件: any) => {
    进度.push(事件.成员 + (事件.阶段 === "完成" ? " 完成" : " 开始"))
  })
  const 归档路径 = path.join(副本, "reference", "讨论", "讨论-智能体派活.md")
  const 归档 = await 读文本(归档路径).catch(() => "")
  console.log(JSON.stringify({
    进度条数: 进度.length,
    成员数: 结果.各自.length,
    汇总前80: String(结果.汇总).slice(0, 80),
    归档存在: 归档.length > 0,
    归档行数: 归档.split("\n").length,
    归档开头: 归档.slice(0, 150),
  }, null, 2))
}

主().catch((错误) => {
  console.error("派活自检失败：", 错误)
  process.exit(1)
})
