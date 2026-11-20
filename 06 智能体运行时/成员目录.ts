// 只负责一件事：定义这个书库里都有哪些智能体，各自管哪一块。
import fs from "node:fs"
import path from "node:path"
import { 读文本 } from "../11 文件工作区/原子写"
import { 找表, 列号, 取行 } from "../09 台账同步/表格改写"
import { 台账册 } from "../10 书库检索/书库布局"
import { 人格默认值, 填书名 } from "./人格默认值"
import type { 固定角色 } from "./人格默认值"

export interface 集群成员 {
  id: string
  名称: string
  角色: string
  管辖: string[]
  人格: string
  状态: string
  最近: string
}

function 读人名(追踪正文: string): string[] {
  const 行们 = 追踪正文.split(/\r?\n/)
  const 表 = 找表(行们, ["姓名", "最后出场"])
  if (!表) return []
  const 姓名列 = 列号(表, "姓名")
  const 结果: string[] = []
  for (let 序 = 表.首行; 序 <= 表.末行; 序++) {
    const 名 = (取行(行们, 序)[姓名列] ?? "").replace(/\*/g, "").trim()
    if (名 && !结果.includes(名)) 结果.push(名)
  }
  return 结果
}

/** 设置里改过的人格模板优先；没改过的用默认文案。 */
function 取人格(模板表: Partial<Record<固定角色, string>> | undefined, 角色: 固定角色, 书名: string): string {
  const 模板 = (模板表?.[角色] ?? "").trim() || 人格默认值[角色]
  return 填书名(模板, 书名)
}

export async function 生成集群(
  根目录: string,
  书名: string,
  人格表?: Partial<Record<固定角色, string>>,
): Promise<集群成员[]> {
  const 追踪 = await 读文本(path.join(根目录, 台账册.出场追踪)).catch(() => "")
  const 人名们 = 读人名(追踪).slice(0, 8)

  const 固定: 集群成员[] = [
    {
      id: "总编",
      名称: "总编",
      角色: "总编",
      管辖: ["导航/事实归属表.md", "书卷.yaml"],
      人格: 取人格(人格表, "总编", 书名),
      状态: "待命",
      最近: "",
    },
    {
      id: "审校",
      名称: "审校",
      角色: "审校",
      管辖: ["校验/一致性核查.md", "设定/规则"],
      人格: 取人格(人格表, "审校", 书名),
      状态: "待命",
      最近: "",
    },
    {
      id: "伏笔",
      名称: "伏笔管家",
      角色: "伏笔",
      管辖: [台账册.承诺台账, "情节/分卷大纲.md"],
      人格: 取人格(人格表, "伏笔", 书名),
      状态: "待命",
      最近: "",
    },
    {
      id: "台账",
      名称: "台账员",
      角色: "台账",
      管辖: [台账册.时间线, 台账册.物品台账],
      人格: 取人格(人格表, "台账", 书名),
      状态: "待命",
      最近: "",
    },
    {
      id: "地点",
      名称: "地点负责人",
      角色: "地点",
      管辖: ["设定/地点", 台账册.时间线],
      人格: 取人格(人格表, "地点", 书名),
      状态: "待命",
      最近: "",
    },
    {
      id: "物品",
      名称: "物品负责人",
      角色: "物品",
      管辖: [台账册.物品台账, "设定/物品"],
      人格: 取人格(人格表, "物品", 书名),
      状态: "待命",
      最近: "",
    },
  ]

  const 人物: 集群成员[] = 人名们.map((名) => ({
    id: "人-" + 名,
    名称: 名,
    角色: "人物",
    管辖: [台账册.出场追踪, 台账册.关系线],
    人格:
      "你是《" + 书名 + "》里「" + 名 + "」的档案负责人。你只掌握这一个人：身份、关系、口癖、属性、此刻状态、不能写什么。" +
      "回答一律以档案为准；档案没写的就明说「未定」，绝不编。每条不超过三行。",
    状态: "待命",
    最近: "",
  }))

  return [...固定, ...人物]
}

/** 集群定义落盘：第一次生成后保存，之后打开书库直接读，保证 id 稳定。 */
export function 读集群(数据目录: string, 书库路径: string): 集群成员[] {
  try {
    const 全部 = JSON.parse(fs.readFileSync(path.join(数据目录, "集群.json"), "utf8"))
    return Array.isArray(全部[书库路径]) ? 全部[书库路径] : []
  } catch {
    return []
  }
}

export function 存集群(数据目录: string, 书库路径: string, 成员们: 集群成员[]): void {
  const 文件 = path.join(数据目录, "集群.json")
  let 全部: Record<string, 集群成员[]> = {}
  try {
    if (fs.existsSync(文件)) 全部 = JSON.parse(fs.readFileSync(文件, "utf8"))
  } catch {
    全部 = {}
  }
  全部[书库路径] = 成员们
  fs.mkdirSync(数据目录, { recursive: true })
  fs.writeFileSync(文件, JSON.stringify(全部, null, 2), "utf8")
}