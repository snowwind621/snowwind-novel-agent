import { 解析frontmatter, 旧字段映射 } from "../../10 书库检索/书库结构"
import fs from "node:fs"
const 文件 = "E:/Snow-Wind/Documents/雪风卷宗/世界末日也要涨粉/设定/世界观/世界-04-暗线与支线全表.md"
const 头 = 解析frontmatter(fs.readFileSync(文件, "utf8"))
console.log("头 =", JSON.stringify(头))
console.log("别名类型 =", Array.isArray(头?.别名), typeof 头?.别名)