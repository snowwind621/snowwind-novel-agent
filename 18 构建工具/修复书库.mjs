// 只负责一件事：修一本「雪风卷宗」书库的内容问题——补回缺失台账、去重、改写死链、frontmatter 中文化。
// 用法：node "18 构建工具/修复书库.mjs" <新书库> [旧书库]
// 纪律：只移动不删除；旧内容进「历史/」「附册/」，不留失踪文件。
import fs from "node:fs"
import path from "node:path"

const 新库 = process.argv[2]
const 旧库 = process.argv[3]
if (!新库) {
  console.error("用法：node \"18 构建工具/修复书库.mjs\" <新书库> [旧书库]")
  process.exit(2)
}

const 统计 = { 补回: 0, 去重: 0, 死链: 0, 字段: 0 }

const 映射 = {
  "设定-01-时间线": "台账/时间线",
  "人物-01-出场追踪": "台账/出场追踪",
  "人物-02-关系线台账": "台账/关系线",
  "人物-03-属性变更台账": "台账/属性变更",
  "人物-04-队伍状态": "台账/队伍状态",
  "设定-07-物品台账": "台账/物品台账",
  "情节-01-承诺台账": "台账/承诺台账",
}

const 附册 = ["人物-00-总入口", "设定-00-总入口", "设定-02-地图与坐标", "设定-04-写法库", "设定-05-角色损耗规则", "设定-06-世界演化时间表", "设定-08-世界运转规则", "设定-09-坏与传与长"]

const 读 = (p) => fs.readFileSync(p, "utf8")
const 写 = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, "utf8") }
function 走(目录) {
  const 出 = []
  if (!fs.existsSync(目录)) return 出
  for (const 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    const 全 = path.join(目录, 项.name)
    if (项.isDirectory()) 出.push(...走(全))
    else 出.push(全)
  }
  return 出
}

if (旧库) {
  const 旧台账 = path.join(旧库, "reference", "台账")
  for (const 名 of fs.existsSync(旧台账) ? fs.readdirSync(旧台账) : []) {
    if (!名.endsWith(".md")) continue
    const 干名 = 名.replace(/\.md$/, "")
    const 目标相对 = 映射[干名] ? 映射[干名] + ".md" : "台账/附册/" + 名
    const 目标 = path.join(新库, 目标相对)
    if (fs.existsSync(目标)) continue
    写(目标, 读(path.join(旧台账, 名)))
    统计.补回++
    console.log("  补回：" + 目标相对)
  }
}

const 正本 = path.join(新库, "台账", "承诺台账.md")
const 副本 = path.join(新库, "情节", "情节-01-承诺台账.md")
if (fs.existsSync(正本) && fs.existsSync(副本)) {
  const 同 = 读(正本) === 读(副本)
  const 历史 = path.join(新库, "情节", "历史")
  fs.mkdirSync(历史, { recursive: true })
  fs.renameSync(副本, path.join(历史, "情节-01-承诺台账-副本.md"))
  写(path.join(新库, "情节", "承诺台账-指针.md"), [
    "# 承诺台账已移到台账区",
    "",
    "> 这里原本有一份 `情节-01-承诺台账.md`，" + (同 ? "与 `台账/承诺台账.md` 内容完全相同" : "是旧格式副本") + "，属于「同一事实存两处」。",
    "> 正本：`台账/承诺台账.md`（唯一允许改的地方）。",
    "> 原文件已整份移到 `情节/历史/情节-01-承诺台账-副本.md`，没有删除任何内容。",
    "",
  ].join("\n"))
  统计.去重++
  console.log("  去重：情节-01-承诺台账 → 情节/历史/，内容相同=" + 同)
}

for (const 文件 of 走(新库).filter((p) => p.endsWith(".md"))) {
  let 文 = 读(文件)
  const 原 = 文
  for (const [旧名, 新] of Object.entries(映射)) {
    文 = 文.split("reference/台账/" + 旧名).join(新)
    文 = 文.split("台账/" + 旧名).join(新)
  }
  for (const 名 of 附册) {
    文 = 文.split("reference/台账/" + 名).join("台账/附册/" + 名)
    文 = 文.split("台账/" + 名).join("台账/附册/" + 名)
  }
  if (文 !== 原) { 写(文件, 文); 统计.死链++ }
}
console.log("  死链改写：命中 " + 统计.死链 + " 个文件")

const 键映射 = [["title", "名称"], ["type", "类型"], ["status", "状态"], ["aliases", "别名"], ["tags", "标签"], ["summary", "摘要"]]
for (const 文件 of 走(path.join(新库, "设定")).filter((p) => p.endsWith(".md"))) {
  const 文 = 读(文件)
  const 匹配 = /^---\r?\n([\s\S]*?)\r?\n---/.exec(文)
  if (!匹配) continue
  let 头 = 匹配[1]
  let 改过 = false
  for (const [旧键, 新键] of 键映射) {
    const 正则 = new RegExp("^" + 旧键 + ":", "m")
    if (正则.test(头)) { 头 = 头.replace(正则, 新键 + ":"); 改过 = true }
  }
  if (!改过) continue
  写(文件, 文.slice(0, 匹配.index) + "---\n" + 头 + "\n---" + 文.slice(匹配.index + 匹配[0].length))
  统计.字段++
}
console.log("  字段中文化：" + 统计.字段 + " 张设定卡")
// ── 三之二、二次死链：引用尾巴上带小节/引文的，只保留路径本体 ──
let 二次 = 0
for (const 文件 of 走(新库).filter((p) => p.endsWith(".md"))) {
  let 文 = 读(文件)
  const 原 = 文
  文 = 文.replace(/情节\/情节-01-承诺台账/g, "台账/承诺台账")
  文 = 文.replace(/(设定-05-角色损耗规则)〔[^〕]*〕/g, "$1")
  文 = 文.replace(/留痕\/留痕-01-规则变更「[^」]*」/g, "留痕/留痕-01-规则变更")
  文 = 文.replace(/(台账\/[^\s|，。；、`）)】〔「]+?)（[^）]*）(?=\s|$)/g, "$1")
  if (文 !== 原) { 写(文件, 文); 二次++ }
}
console.log("  二次死链：" + 二次 + " 个文件")

console.log("")
console.log("完成：" + JSON.stringify(统计))
