// 只负责一件事：在书库副本上跑一次台账同步，验证改写与提交。
import { 创建请求处理 } from "../01 应用外壳/请求处理"

const 副本 = process.argv[2]
const 数据目录 = (process.env.APPDATA ?? "") + "\\snowwind-novel-agent"

async function 主() {
  const 处理器 = 创建请求处理(数据目录)
  const 项目 = await 处理器.处理["项目/打开"](副本)
  console.log("装载：" + 项目.书名 + " " + 项目.统计.章数 + " 章")
  const 结果 = await 处理器.处理["台账/同步"](27)
  console.log(JSON.stringify(结果, null, 2))
}

主().catch((错误) => {
  console.error("台账自检失败：", 错误)
  process.exit(1)
})
