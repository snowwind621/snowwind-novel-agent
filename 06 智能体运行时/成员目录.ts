// 只负责一件事：定义这个书库里都有哪些智能体，各自管哪一块。
import fs from "node:fs"
import path from "node:path"
import { 读文本 } from "../11 文件工作区/原子写"
import { 找表, 列号, 取行 } from "../09 台账同步/表格改写"

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

export async function 生成集群(根目录: string, 书名: string): Promise<集群成员[]> {
  const 追踪 = await 读文本(path.join(根目录, "reference", "台账", "人物-01-出场追踪.md")).catch(() => "")
  const 人名们 = 读人名(追踪).slice(0, 8)

  const 固定: 集群成员[] = [
    {
      id: "总编",
      名称: "总编",
      角色: "总编",
      管辖: ["reference/导航/事实归属表.md", "AGENTS.md"],
      人格: "你是《" + 书名 + "》的总编。你只做三件事：把目标拆成可执行的小事、判断取舍与节奏、指出谁该出场。你不写正文，不说空话，每条结论不超过两行。",
      状态: "待命",
      最近: "",
    },
    {
      id: "审校",
      名称: "审校",
      角色: "审校",
      管辖: ["reference/核对/核对-06-一致性核查.md", "lorebook/instruction/写作规则/写作-01-红线与硬约束.md"],
      人格: "你是《" + 书名 + "》的审校。你只挑错：设定矛盾、称呼错、时间线冲突、伏笔未回收、违反红线。每条必须给出处，没有出处的不要提。",
      状态: "待命",
      最近: "",
    },
    {
      id: "伏笔",
      名称: "伏笔管家",
      角色: "伏笔",
      管辖: ["reference/情节/情节-01-承诺台账.md", "reference/情节/情节-03-禁揭清单.md"],
      人格: "你是《" + 书名 + "》的伏笔管家。你只关心承诺的两端：哪条埋下了、哪条该兑、哪条搁置太久、哪条现在还禁揭。一律以台账编号说话，不自己发明编号。",
      状态: "待命",
      最近: "",
    },
    {
      id: "台账",
      名称: "台账员",
      角色: "台账",
      管辖: ["reference/台账/设定-01-时间线.md", "reference/台账/设定-07-物品台账.md"],
      人格: "你是《" + 书名 + "》的台账员。你只做事实入账：谁在哪、哪天、什么东西什么状态。不评价、不推断、不补全。",
      状态: "待命",
      最近: "",
    },
    {
      id: "地点",
      名称: "地点负责人",
      角色: "地点",
      管辖: ["reference/台账/设定-02-地图与坐标.md", "lorebook/location/地点-01-地点志-鸭桥镇与丸井家.md"],
      人格: "你是《" + 书名 + "》的地点负责人。你只答空间与方位：谁从哪到哪、走多久、哪条路通不通、这地方现在什么样。方位没写死就说未定。",
      状态: "待命",
      最近: "",
    },
    {
      id: "物品",
      名称: "物品负责人",
      角色: "物品",
      管辖: ["reference/台账/设定-07-物品台账.md", "lorebook/item/物品-01-物品志.md"],
      人格: "你是《" + 书名 + "》的物品负责人。你只答物件：现在在谁手上、什么状态、还能不能用、坏了怎么没的。余量不报数。",
      状态: "待命",
      最近: "",
    },
  ]

  const 人物: 集群成员[] = 人名们.map((名) => ({
    id: "人-" + 名,
    名称: 名,
    角色: "人物",
    管辖: ["reference/台账/人物-01-出场追踪.md", "reference/台账/人物-02-关系线台账.md"],
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
