import { 该不该提交, 记下提交 } from "../../11 文件工作区/提交策略"

const 库 = "E:/Snow-Wind/Documents/雪风卷宗/世界末日也要涨粉"
async function 跑() {
  const 起 = Date.now()
  const 首次 = await 该不该提交(库, "正文A", false)
  const 二次 = await 该不该提交(库, "正文B", false)
  const 同文 = await 该不该提交(库, "正文B", false)
  const 手动 = await 该不该提交(库, "正文C", true)
  记下提交(库, "正文C")
  const 之后 = await 该不该提交(库, "正文D", false)
  console.log(JSON.stringify({ 首次: 首次.原因, 二次: 二次.原因, 同文: 同文.原因, 手动: 手动.原因, 刚提交后: 之后.原因 }))
  const 起2 = Date.now()
  for (let i = 0; i < 20; i++) await 该不该提交(库, "第" + i + "次", false)
  console.log("20 次判断耗时 " + (Date.now() - 起2) + "ms")
}
void 跑()