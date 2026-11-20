// 只负责一件事：把一本旧格式书库（NeuroBook 目录）转换成「雪风卷宗」，旧目录只读不动。
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { 路径, 台账册, 卷目录名, 章文件名, 解析章文件名, 造清单 } from "../10 书库检索/书库布局"

export interface 导入统计 {
  卷: number
  章: number
  设定: number
  台账: number
  附录: number
}

export interface 导入结果 {
  成功: boolean
  说明: string
  统计?: 导入统计
}

const 旧章标题 = (文件名: string): string => {
  const 匹配 = /^\d{4,5}-(.+)\.md$/.exec(文件名)
  return 匹配 ? 匹配[1] : 文件名.replace(/\.md$/, "")
}

const 旧章序号 = (文件名: string): number => {
  const 匹配 = /^(\d{4,5})-/.exec(文件名)
  return 匹配 ? Number(匹配[1]) : 0
}

function 读旧卷(xml: string): Array<{ 卷号: number; 章号: number[] }> {
  const 结果: Array<{ 卷号: number; 章号: number[] }> = []
  const 组 = /<group\s+id="([^"]+)"\s*>([\s\S]*?)<\/group>/g
  let 匹配: RegExpExecArray | null
  while ((匹配 = 组.exec(xml)) !== null) {
    const 章号: number[] = []
    const 章正则 = /<chapter\s+id="([^"]+)"\s*\/?>/g
    let 章匹配: RegExpExecArray | null
    while ((章匹配 = 章正则.exec(匹配[2])) !== null) 章号.push(Number(章匹配[1]))
    结果.push({ 卷号: Number(匹配[1]), 章号 })
  }
  return 结果
}

async function 列(目录: string): Promise<fsSync.Dirent[]> {
  try {
    return await fs.readdir(目录, { withFileTypes: true })
  } catch {
    return []
  }
}

async function 复制若干(source: string, target: string, 只要md = true): Promise<number> {
  let 数 = 0
  await fs.mkdir(target, { recursive: true })
  for (const 项 of await 列(source)) {
    if (项.isDirectory()) continue
    if (只要md && !项.name.endsWith(".md")) continue
    await fs.copyFile(path.join(source, 项.name), path.join(target, 项.name))
    数++
  }
  return 数
}

const 设定映射: Record<string, string> = {
  world: "世界观",
  character: "人物",
  location: "地点",
  item: "物品",
  faction: "势力",
  system: "制度",
  event: "事件",
  instruction: "规则",
  note: "备注",
}

const 台账映射: Array<[string, string]> = [
  ["设定-01-时间线.md", 台账册.时间线],
  ["人物-01-出场追踪.md", 台账册.出场追踪],
  ["人物-02-关系线台账.md", 台账册.关系线],
  ["人物-03-属性变更台账.md", 台账册.属性变更],
  ["人物-04-队伍状态.md", 台账册.队伍状态],
  ["设定-07-物品台账.md", 台账册.物品台账],
  ["情节-01-承诺台账.md", 台账册.承诺台账],
]

export async function 导入旧书库(旧根: string, 新根: string): Promise<导入结果> {
  const 统计: 导入统计 = { 卷: 0, 章: 0, 设定: 0, 台账: 0, 附录: 0 }

  if (!fsSync.existsSync(path.join(旧根, "project.yaml")) && !fsSync.existsSync(path.join(旧根, "manuscripts.binder"))) {
    return { 成功: false, 说明: "这不是一个旧格式书库：找不到 project.yaml 或 manuscripts.binder" }
  }
  if (fsSync.existsSync(新根)) {
    const 已有 = await 列(新根)
    if (已有.length > 0) return { 成功: false, 说明: "目标目录不是空的，换一个空目录" }
  }

  const 书名匹配 = /^title:\s*(.+)$/m.exec(await fs.readFile(path.join(旧根, "project.yaml"), "utf8").catch(() => ""))
  const 书名 = 书名匹配 ? 书名匹配[1].replace(/^["']|["']$/g, "").trim() : path.basename(旧根)

  await fs.mkdir(新根, { recursive: true })
  await fs.writeFile(path.join(新根, 路径.清单), 造清单(书名), "utf8")

  // 正文
  const 束 = await fs.readFile(path.join(旧根, "manuscripts.binder", "binder.xml"), "utf8").catch(() => "")
  const 卷们 = 读旧卷(束)
  const 章文件表 = new Map<number, string>()
  for (const 项 of await 列(path.join(旧根, "manuscripts.binder"))) {
    if (项.isDirectory() || !项.name.endsWith(".md")) continue
    const 号 = 旧章序号(项.name)
    if (号) 章文件表.set(号, 项.name)
  }

  const 卷清单 = 卷们.length > 0 ? 卷们 : [{ 卷号: 1, 章号: [...章文件表.keys()].sort((甲, 乙) => 甲 - 乙) }]
  for (const 卷 of 卷清单) {
    if (卷.章号.length === 0) continue
    const 卷目录 = path.join(新根, 路径.正文, 卷目录名(卷.卷号))
    await fs.mkdir(卷目录, { recursive: true })
    统计.卷++
    for (const 号 of 卷.章号) {
      const 旧名 = 章文件表.get(号)
      if (!旧名) continue
      const 正文 = await fs.readFile(path.join(旧根, "manuscripts.binder", 旧名), "utf8")
      await fs.writeFile(path.join(卷目录, 章文件名(号, 旧章标题(旧名))), 正文, "utf8")
      统计.章++
    }
  }

  // 设定：lorebook 分类 → 设定/中文类
  for (const 项 of await 列(path.join(旧根, "lorebook"))) {
    if (!项.isDirectory()) continue
    const 中文类 = 设定映射[项.name] ?? 项.name
    统计.设定 += await 复制若干(path.join(旧根, "lorebook", 项.name), path.join(新根, 路径.设定, 中文类))
  }
  const 镜像 = path.join(旧根, "reference", "设定面板-现状.json")
  if (fsSync.existsSync(镜像)) {
    await fs.mkdir(path.join(新根, 路径.设定), { recursive: true })
    await fs.copyFile(镜像, path.join(新根, 路径.面板镜像))
  }

  // 台账：按七册改名
  await fs.mkdir(path.join(新根, 路径.台账), { recursive: true })
  for (const [旧名, 新相对] of 台账映射) {
    const 源 = path.join(旧根, "reference", 旧名.startsWith("情节") ? "情节" : "台账", 旧名)
    if (!fsSync.existsSync(源)) continue
    await fs.copyFile(源, path.join(新根, 新相对))
    统计.台账++
  }

  // 附录目录：情节 / 核对 / 留痕 / 考据 / 导航 / 讨论
  const 附录映射: Array<[string, string]> = [
    ["情节", 路径.情节],
    ["核对", 路径.校验],
    ["留痕", 路径.留痕],
    ["考据", 路径.考据],
    ["导航", 路径.导航],
    ["讨论", 路径.讨论],
  ]
  for (const [旧名, 新相对] of 附录映射) {
    const 源 = path.join(旧根, "reference", 旧名)
    if (!fsSync.existsSync(源)) continue
    统计.附录 += await 复制若干(源, path.join(新根, 新相对))
  }

  return {
    成功: true,
    说明: "已转成「雪风卷宗」：" + 书名 + "（" + 统计.卷 + " 卷 " + 统计.章 + " 章，" + 统计.设定 + " 份设定，" + 统计.台账 + " 册台账）→ " + 新根,
    统计,
  }
}
