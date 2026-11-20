// 只负责一件事：命令行把旧书库转成「雪风卷宗」。
import { 导入旧书库 } from "../16 书库迁移/导入旧书库"

const 旧根 = process.argv[2]
const 新根 = process.argv[3]

if (!旧根 || !新根) {
  console.error("用法：node 99 构建产物/导入.cjs <旧书库目录> <新书库目录>")
  process.exit(1)
}

导入旧书库(旧根, 新根)
  .then((结果) => {
    console.log(JSON.stringify(结果, null, 2))
    process.exit(结果.成功 ? 0 : 1)
  })
  .catch((错误) => {
    console.error("导入失败：", 错误)
    process.exit(1)
  })
