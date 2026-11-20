// 只负责一件事：不启动界面，直接验证解析层能不能读懂真实书库。
import { 扫描项目 } from "../10 书库检索/项目扫描"
import { 装配看板 } from "../10 书库检索/看板装配"

const 书库 = process.argv[2]

async function 主() {
  const 项目 = await 扫描项目(书库)
  const 看板 = await 装配看板(书库, 项目.统计.最新章节)
  const 摘 = (组: typeof 看板.伏笔) =>
    组.slice(0, 5).map((x) => x.编号 + " " + x.名称 + "｜埋ch" + x.埋章 + "｜搁置" + x.搁置章数 + "｜间隔" + x.参考间隔)
  console.log(JSON.stringify({
    书名: 项目.书名,
    卷数: 项目.卷.length,
    章数: 项目.统计.章数,
    总字数: 项目.统计.总字数,
    最新章节: 项目.统计.最新章节,
    伏笔统计: 看板.统计,
    超期: 摘(看板.伏笔.filter((x) => x.超期)),
    久置: 摘(看板.伏笔.filter((x) => x.久置)),
    已兑: 摘(看板.伏笔.filter((x) => x.状态 === "已兑现")),
    台账册数: 看板.台账.length,
  }, null, 2))
}

主().catch((错误) => {
  console.error("自检失败：", 错误)
  process.exit(1)
})
