// 只负责一件事：写完停手后再同步台账——脏标记、空闲触发、单飞串行、指纹幂等、失败只重试一次。
//
// 设计约束（别走偏）：保存只登记指纹不跑模型；停手「静置秒」后才跑；同一内容绝不重复跑
// （已同步指纹落 JSON，重启也不重跑）；同一章不并发、不同章串行；失败自动重试有限次后停下等人接手。

import fs from "node:fs"
import path from "node:path"
import { 指纹 } from "../11 文件工作区/提交策略"
import type { 同步结果 } from "./同步台账"
import type { 自动同步推进, 台账设置 } from "../03 进程桥接/通道"

export interface 自动同步状态 {
  待同步: number[]
  正在跑: number[]
  上次: Record<number, { 时刻: number; 成功: boolean; 说明: string }>
}

export interface 自动同步依赖 {
  数据目录: string
  读书库: () => string | null
  读台账设置: () => 台账设置
  /** 真跑一章：由请求处理提供（组装标题/正文/待兑伏笔后调 同步章节台账） */
  同步一章: (章号: number) => Promise<同步结果>
  /** 成功后重装看板 */
  刷新看板: () => Promise<void>
  /** 推给界面（IPC / SSE 各一条线路） */
  推事件: (事件: 自动同步推进) => void
}

interface 队项 {
  章号: number
  指纹: string
  正文: string
  试过: number
}

export interface 运行器 {
  标记待同步: (章号: number, 正文: string) => void
  取状态: () => 自动同步状态
  立即同步: (章号: number) => Promise<同步结果>
  停: () => void
}

/** 每本书一个运行器；请求处理在「装载」时注册。 */
const 运行器表 = new Map<string, 运行器>()

/** 用书库路径做个短指印，只为了把「已同步指纹」按书分开存。 */
function 指印(文本: string): string {
  let 值 = 0
  for (let 序 = 0; 序 < 文本.length; 序++) 值 = (值 * 31 + 文本.charCodeAt(序)) >>> 0
  return 值.toString(16)
}

function 失败结果(说明: string): 同步结果 {
  return { 成功: false, 说明, 改动: [], 提交: "", 抽取: { 在场: [], 日期: "", 事件: [], 已兑现: [] } }
}

export function 创建自动同步(依赖: 自动同步依赖): 运行器 {
  const 队列 = new Map<number, 队项>()
  const 正在跑 = new Set<number>()
  const 上次: 自动同步状态["上次"] = {}
  const 已同步 = new Map<number, string>()
  let 计时: ReturnType<typeof setTimeout> | null = null

  const 指纹文件 = (): string => path.join(依赖.数据目录, "自动同步-" + (指印(依赖.读书库() ?? "") || "默认") + ".json")
  try {
    const 旧 = JSON.parse(fs.readFileSync(指纹文件(), "utf8")) as Record<string, string>
    for (const [章号, 值] of Object.entries(旧 ?? {})) 已同步.set(Number(章号), String(值))
  } catch {
    /* 第一次跑，没有历史 */
  }
  const 落指纹 = () => {
    try {
      fs.mkdirSync(依赖.数据目录, { recursive: true })
      fs.writeFileSync(指纹文件(), JSON.stringify(Object.fromEntries(已同步)), "utf8")
    } catch {
      /* 记不住指纹不影响同步本身，最多重启后再跑一次 */
    }
  }

  const 清计时 = () => {
    if (计时 !== null) {
      clearTimeout(计时)
      计时 = null
    }
  }
  const 排计时 = () => {
    清计时()
    const 秒 = Math.max(5, Math.min(120, 依赖.读台账设置().静置秒 || 20))
    计时 = setTimeout(() => {
      计时 = null
      void 跑队首()
    }, 秒 * 1000)
  }

  const 取状态 = (): 自动同步状态 => ({
    待同步: [...队列.keys()].sort((甲, 乙) => 甲 - 乙),
    正在跑: [...正在跑],
    上次: { ...上次 },
  })

  /** 队首跑一章；跑完队列里还有就重新排计时器。 */
  async function 跑队首(): Promise<void> {
    计时 = null
    if (正在跑.size > 0) return
    const 首个 = [...队列.entries()].sort((甲, 乙) => 甲[0] - 乙[0])[0]
    if (!首个) return
    const [章号, 项] = 首个
    队列.delete(章号)
    if (已同步.get(章号) === 项.指纹) {
      依赖.推事件({ 章号, 阶段: "完成", 说明: "内容没变，跳过（0 次模型调用）", 用量: null })
      if (队列.size > 0) 排计时()
      return
    }
    正在跑.add(章号)
    依赖.推事件({ 章号, 阶段: "开始", 说明: "停手了，开始同步第 " + 章号 + " 章台账" })
    let 结果: 同步结果
    try {
      结果 = await 依赖.同步一章(章号)
    } catch (错误: any) {
      结果 = 失败结果("同步抛错：" + String(错误?.message ?? 错误).slice(0, 160))
    }
    正在跑.delete(章号)
    const 上限 = Math.max(0, 依赖.读台账设置().失败重试次数)
    if (结果.成功) {
      已同步.set(章号, 项.指纹)
      落指纹()
      上次[章号] = { 时刻: Date.now(), 成功: true, 说明: 结果.说明 }
      await 依赖.刷新看板().catch(() => {})
      依赖.推事件({ 章号, 阶段: "完成", 说明: 结果.说明, 用量: { 估算词元: Math.ceil(项.正文.length / 1.5) } })
    } else if (项.试过 < 上限) {
      队列.set(章号, { ...项, 试过: 项.试过 + 1 })
      上次[章号] = { 时刻: Date.now(), 成功: false, 说明: "失败，将自动重试：" + 结果.说明 }
      依赖.推事件({ 章号, 阶段: "失败", 说明: "第一次失败，稍后自动重试一次：" + 结果.说明, 用量: null })
    } else {
      上次[章号] = { 时刻: Date.now(), 成功: false, 说明: "失败（已用完自动重试）：" + 结果.说明 }
      依赖.推事件({ 章号, 阶段: "失败", 说明: "失败，已停止自动重试：" + 结果.说明, 用量: null })
    }
    if (队列.size > 0) 排计时()
  }

  const 标记待同步 = (章号: number, 正文: string) => {
    if (!依赖.读台账设置().自动同步) return
    const 值 = 指纹(正文)
    if (已同步.get(章号) === 值) return
    const 旧 = 队列.get(章号)
    队列.set(章号, { 章号, 指纹: 值, 正文, 试过: 旧?.试过 ?? 0 })
    排计时()
  }

  const 立即同步 = async (章号: number): Promise<同步结果> => {
    清计时()
    const 项 = 队列.get(章号)
    const 正文 = 项?.正文 ?? ""
    队列.delete(章号)
    正在跑.add(章号)
    依赖.推事件({ 章号, 阶段: "开始", 说明: "手动同步第 " + 章号 + " 章台账" })
    let 结果: 同步结果
    try {
      结果 = await 依赖.同步一章(章号)
    } catch (错误: any) {
      结果 = 失败结果("同步抛错：" + String(错误?.message ?? 错误).slice(0, 160))
    }
    正在跑.delete(章号)
    上次[章号] = { 时刻: Date.now(), 成功: 结果.成功, 说明: 结果.说明 }
    if (结果.成功 && 正文) {
      已同步.set(章号, 指纹(正文))
      落指纹()
      await 依赖.刷新看板().catch(() => {})
    }
    依赖.推事件({ 章号, 阶段: 结果.成功 ? "完成" : "失败", 说明: 结果.说明, 用量: null })
    if (队列.size > 0) 排计时()
    return 结果
  }

  const 停 = () => {
    清计时()
    队列.clear()
    正在跑.clear()
  }

  return { 标记待同步, 取状态, 立即同步, 停 }
}

/** 请求处理在打开书库时注册；同一本书重复注册就换掉旧的（旧运行器先停）。 */
export function 注册自动同步(根目录: string, 运行器: 运行器): void {
  运行器表.get(根目录)?.停()
  运行器表.set(根目录, 运行器)
}

export function 取运行器(根目录: string): 运行器 | null {
  return 运行器表.get(根目录) ?? null
}

export function 标记待同步(根目录: string, 章号: number, 正文: string): void {
  取运行器(根目录)?.标记待同步(章号, 正文)
}

export function 取自动状态(根目录: string): 自动同步状态 {
  return 取运行器(根目录)?.取状态() ?? { 待同步: [], 正在跑: [], 上次: {} }
}

export function 立即同步(根目录: string, 章号: number): Promise<同步结果> {
  const 器 = 取运行器(根目录)
  if (!器) return Promise.resolve(失败结果("还没有打开书库"))
  return 器.立即同步(章号)
}
