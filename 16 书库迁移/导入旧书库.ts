// 只负责一件事：把一本旧格式书库（NeuroBook 目录）转换成「雪风卷宗」，旧目录只读不动；旧镜像里的「参考间隔」并进承诺台账，镜像本身不带进新书库。
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { 路径, 台账册, 卷目录名, 章文件名, 解析章文件名, 造清单 } from "../10 书库检索/书库布局"
import { 找表们, 列号, 取行, 写行 } from "../09 台账同步/表格改写"

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

/** 旧面板镜像里的一条伏笔要并进台账的可选列。 */
interface 旧镜像列 {
  名称: string
  /** 从一条旧镜像条目里取值；空串表示这条没写，格子留空。 */
  取值: (条: any) => string
}

function 取文字(值: unknown): string {
  return typeof 值 === "string" ? 值.trim() : ""
}

/** 旧镜像 → 台账的列映射：只有这一份，「参考间隔」也只是其中一行。 */
const 旧镜像列们: 旧镜像列[] = [
  {
    名称: "参考间隔",
    取值: (条) =>
      typeof 条?.fields?.参考间隔 === "number" && Number.isFinite(条.fields.参考间隔) ? String(条.fields.参考间隔) : "",
  },
  { 名称: "重要程度", 取值: (条) => 取文字(条?.fields?.重要程度) },
  { 名称: "意图", 取值: (条) => 取文字(条?.fields?.意图) },
]

/** 旧面板镜像（外部软件产出）里的 p-NNN → 条目；没有镜像是空表。 */
async function 读旧伏笔(旧根: string): Promise<Map<string, any>> {
  const 表 = new Map<string, any>()
  let 镜像: any = null
  try {
    镜像 = JSON.parse(await fs.readFile(path.join(旧根, "reference", "设定面板-现状.json"), "utf8"))
  } catch {
    return 表
  }
  for (const 条 of Array.isArray(镜像?.entries) ? 镜像.entries : []) {
    if (条?.type !== "伏笔") continue
    const 匹配 = /^(p-\d+)/.exec(String(条?.name ?? ""))
    if (匹配) 表.set(匹配[1], 条)
  }
  return 表
}

/**
 * 给新书库的承诺台账补上旧镜像里的可选列（参考间隔 / 重要程度 / 意图）。
 * 一套加列逻辑只写一遍：行数不变、列顺序不变、原有格子一字不动；某列一个值都填不上就整列不加。
 * 返回每一列真正填上值的行数。
 */
async function 并入旧镜像列(
  旧根: string,
  新台账: string,
  列们: 旧镜像列[],
): Promise<Array<{ 列: string; 行数: number }>> {
  const 计数 = 列们.map((列) => ({ 列: 列.名称, 行数: 0 }))
  const 镜像 = await 读旧伏笔(旧根)
  if (镜像.size === 0 || 列们.length === 0 || !fsSync.existsSync(新台账)) return 计数
  const 原文 = await fs.readFile(新台账, "utf8")
  const 换行 = 原文.includes("\r\n") ? "\r\n" : "\n"
  const 行们 = 原文.split(/\r?\n/)
  const 表们 = 找表们(行们, ["编号", "承诺"])
  if (表们.length === 0) return 计数

  for (const 表 of 表们) {
    const 缺的 = 列们.filter((列) => !表.表头.some((头) => 头.includes(列.名称)))
    const 编号列 = 列号(表, "编号")
    if (缺的.length === 0 || 编号列 < 0) continue
    写行(行们, 表.表头行, [...取行(行们, 表.表头行), ...缺的.map((列) => 列.名称)])
    写行(行们, 表.表头行 + 1, [...取行(行们, 表.表头行 + 1), ...缺的.map(() => "---")])
    for (let 序 = 表.首行; 序 <= 表.末行; 序++) {
      // 有的历史行末尾空格子被省掉了，先补齐到表头列数，新列才不会错行。
      const 原格们 = 取行(行们, 序)
      const 格们 =
        原格们.length < 表.表头.length ? [...原格们, ...Array(表.表头.length - 原格们.length).fill("")] : 原格们
      const 编号 = (格们[编号列] ?? "").replace(/\*/g, "").trim()
      const 条 = 镜像.get(编号)
      const 新格们 = 缺的.map((列) => {
        const 值 = 条 === undefined ? "" : 列.取值(条)
        if (值) {
          const 记 = 计数.find((项) => 项.列 === 列.名称)
          if (记) 记.行数++
        }
        return 值
      })
      写行(行们, 序, [...格们, ...新格们])
    }
  }
  if (计数.every((项) => 项.行数 === 0)) return 计数
  await fs.writeFile(新台账, 行们.join(换行), "utf8")
  return 计数
}

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
  // 台账：按七册改名
  await fs.mkdir(path.join(新根, 路径.台账), { recursive: true })
  for (const [旧名, 新相对] of 台账映射) {
    const 源 = path.join(旧根, "reference", 旧名.startsWith("情节") ? "情节" : "台账", 旧名)
    if (!fsSync.existsSync(源)) continue
    await fs.copyFile(源, path.join(新根, 新相对))
    统计.台账++
  }
  const 并入 = await 并入旧镜像列(旧根, path.join(新根, 台账册.承诺台账), 旧镜像列们)

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
    说明:
      "已转成「雪风卷宗」：" +
      书名 +
      "（" +
      统计.卷 +
      " 卷 " +
      统计.章 +
      " 章，" +
      统计.设定 +
      " 份设定，" +
      统计.台账 +
      " 册台账" +
      (并入.some((项) => 项.行数 > 0)
        ? "，" + 并入.filter((项) => 项.行数 > 0).map((项) => 项.列 + "并入 " + 项.行数 + " 行").join("，")
        : "") +
      "）→ " +
      新根,
    统计,
  }
}
