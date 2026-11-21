// 只负责一件事：给界面提供强类型的「桥」入口与共用小工具。
import type { 项目摘要, 看板数据, 设置, 外观设置, 编辑器设置, 模型设置, 上下文设置, 智能体设置, 台账设置, 书库设置, 技能项, 对话请求, 章节摘要, 待裁定章, 待裁定条目, 一致性问题, 补齐结果, 文件节点, 文件树结果, 文件内容, 用量 } from "../03 进程桥接/通道"
import { 创建网页桥 } from "./网页桥"
import { 默认设置 } from "../14 配置密钥/默认设置"

export { 默认设置 }

export type { 台账设置, 一致性问题, 补齐结果, 项目摘要, 看板数据, 设置, 外观设置, 编辑器设置, 模型设置, 上下文设置, 智能体设置, 书库设置, 技能项, 对话请求, 章节摘要, 待裁定章, 待裁定条目, 文件节点, 文件树结果, 文件内容, 用量 }

/** 服务端推回来的工具回执（task-20 的工具就在这条事件里报进度）。 */
export interface 工具回执 {
  名称: string
  中文名: string
  参数: Record<string, unknown>
  状态: "开始" | "完成" | "失败" | "待确认"
  轮次: number
  结果字数?: number
  摘要?: string
}

/** 「计划」事件里的计划表 */
export interface 计划步 {
  动作: string
  目标文件: string
  说明: string
}

export interface 计划卡 {
  路径: string
  标题: string
  步骤: 计划步[]
}

/** 「提问」事件里的问题（选项可选） */
export interface 提问卡 {
  问题: string
  选项?: string[]
  /** 预设之外的建议回答（灰字一段，可点也可抄） */
  建议?: string
}

/** 某一章上一次自动同步的结果 */
export interface 自动同步上次 {
  时刻: number
  成功: boolean
  说明: string
  用时毫秒?: number
  用量?: 用量
}

/** 一致性检查的汇总，状态字和面板顶部都用它 */
export interface 一致性提示 {
  问题数: number
  可补齐: number
  需裁定: number
  /** 提示 = 半成品里的正常情况（计划中的章），不计入错误数 */
  提示: number
}

export interface 一致性报告 extends 一致性提示 {
  问题们: 一致性问题[]
  /** 后端只回前 200 条；这个数字表示总条数（可能大于 问题们.length） */
  显示条数?: number
}

export interface 自动同步状态 {
  待同步: number[]
  正在跑: number[]
  上次: Record<string, 自动同步上次>
}

export interface 自动同步进度 {
  章号: number
  阶段: "开始" | "完成" | "失败"
  说明: string
  用量?: 用量
}

export interface 对话事件 {
  请求号: string
  类型: "思考" | "正文" | "结束" | "错误" | "用量" | "工具" | "提问" | "计划"
  /** 「用量」时这里是一段 JSON（用量 结构） */
  文本: string
}

export interface 集群成员 {
  id: string
  名称: string
  角色: string
  管辖: string[]
  人格: string
  状态: string
  最近: string
}

export interface 知情条目 {
  秘密: string
  人: string
  何时知道: number | null
  依据: string
}

export interface 知情结果 {
  /** 有没有 台账/知情台账.md；没有也能用，只是空态 + 候选 */
  有台账: boolean
  /** 后端真实形状：按秘密分组（此前这里写的是 条目/秘密们，和实现对不上，导致秘密页白屏） */
  秘密: Array<{ 名称: string; 知情: 知情条目[]; 不知情: string[] }>
  候选?: Array<{ 名称: string; 可能涉及?: string[] }>
  说明?: string
  人: string[]
}

/** 多视角闭环的一段进度（桌面端由主进程推送） */
export interface 多视角进度 {
  阶段: "纲要" | "在场" | "发言" | "收敛" | "成文" | "核对" | "完成" | "失败"
  谁?: string
  摘要?: string
  文本?: string
}

/** 大纲核对结论：偏离才阻断落盘，无法判定要人工看 */
export interface 多视角核对结论 {
  结论: "通过" | "偏离" | "无法判定"
  符合: boolean
  偏离: string[]
  无法判定: string[]
  依据: string
}

/** 多视角最小闭环的结果（不落盘，作者点「采用这段」才写章节） */
export interface 多视角结果 {
  成功: boolean
  章节号: number
  在场: string[]
  各视角: Array<{ 成员: string; 发言: string }>
  收敛: string
  正文: string
  大纲核对: 多视角核对结论
  信息闸?: { 下发: string[]; 卡住: string[] }
  说明: string
}

export interface 派活成员结果 {
  成员: string
  角色: string
  产出: string
  成功: boolean
  用时毫秒: number
}

export interface 派活结果 {
  任务: string
  用时毫秒: number
  各自: 派活成员结果[]
  汇总: string
}

export interface 书架项 {
  路径: string
  书名: string
  最后打开: string
}

export interface 改写请求 {
  请求号: string
  模型: string
  章节号: number
  标题: string
  原文: string
  前文: string
  后文: string
  指令: string
}

export interface 续写请求 {
  请求号: string
  模型: string
  章节号: number
  标题: string
  已有正文: string
  指令?: string
}

export interface 派活进度 {
  任务号: string
  成员: string
  角色: string
  阶段: "开始" | "完成"
  完成数: number
  总数: number
}

export interface 导出结果 {
  成功: boolean
  说明: string
  路径: string
}

export interface 对话条目 {
  id: string
  谁: "你" | "总编" | "集群" | "系统" | "改写"
  文本: string
  明细?: 派活成员结果[]
  进行中?: boolean
  /** 说话时刻（毫秒时间戳），界面只显示 HH:mm */
  时间?: number
  /** 被重新生成 / 重试替代了，正文留着但标一下 */
  被替代?: boolean
  /** 这次生成失败了，给一个重试按钮 */
  出错?: boolean
  /** 这一轮网关报的用量；没有就是 undefined，界面显示「—」 */
  用量?: 用量
  /** 工具回执气泡（谁固定是「系统」） */
  工具?: 工具回执
  /** 计划表气泡 */
  计划?: 计划卡
  /** 问题气泡 */
  提问?: 提问卡
  /** 这一条已经答了哪一句（答过的卡按钮置灰） */
  提问答?: string
  /** 思考过程（流式累积，界面上折叠成一块） */
  思考?: string
}

export interface 同步结果 {
  成功: boolean
  说明: string
  改动: string[]
  提交: string
  抽取: { 在场: string[]; 日期: string; 事件: string[]; 已兑现: string[] }
}

export interface 桥接口 {
  打开项目: (路径: string) => Promise<项目摘要 | null>
  当前项目: () => Promise<项目摘要 | null>
  读取章节: (编号: number) => Promise<{ 编号: number; 标题: string; 正文: string }>
  保存章节: (编号: number, 正文: string, 立即?: boolean) => Promise<{ 成功: boolean; 说明: string }>
  读取看板: () => Promise<看板数据>
  台账同步: (章节号: number) => Promise<同步结果>
  /** 台账自动同步的当前状态：哪些章待同步、哪些正在跑、每章上次结果 */
  台账自动状态: () => Promise<自动同步状态>
  /** 手动重试某一章（失败后就靠它） */
  台账立即同步: (章节号: number) => Promise<同步结果>
  /** 后台推送：开始 / 完成 / 失败；浏览器预览里退化成轮询比对 */
  监听自动同步: (回调: (事件: 自动同步进度) => void) => () => void
  /** 跨台账一致性检查（可能还没在桌面预加载里注册，所以是可选的） */
  台账一致性检查?: () => Promise<一致性报告>
  /** 多视角最小闭环：在场角色各说一段 → 收敛 → 执笔 → 大纲核对；只预览不落盘 */
  多视角?: (章节号?: number, 执笔模型?: string) => Promise<多视角结果>
  /** 多视角分步进度（桌面端推送；浏览器预览没有推送通道） */
  监听多视角?: (回调: (事件: 多视角进度) => void) => () => void
  /** 一键补齐可修的那些（桥上会替界面带上「确认」） */
  台账一致性补齐?: (问题们?: 一致性问题[], 确认?: boolean) => Promise<补齐结果>
  /** 一致性结果变了（补齐 / 台账同步之后） */
  监听一致性?: (回调: (事件: 一致性提示) => void) => () => void
  集群成员: () => Promise<集群成员[]>
  新建成员: (名称: string, 职责: string, 管辖文本: string) => Promise<集群成员[]>
  删除成员: (id: string) => Promise<集群成员[]>
  改成员: (id: string, 名称: string, 职责: string, 管辖文本: string) => Promise<集群成员[]>
  续写: (请求: 续写请求) => Promise<{ 已接收: boolean }>
  改写: (请求: 改写请求) => Promise<{ 已接收: boolean }>
  派活: (任务: string, 章节号: number) => Promise<派活结果>
  监听派活: (回调: (事件: 派活进度) => void) => () => void
  导出: (格式: string) => Promise<导出结果>
  导入旧书库: (旧根: string, 新根: string) => Promise<{ 成功: boolean; 说明: string }>
  书库文件树: () => Promise<文件树结果>
  书库读文件: (相对路径: string) => Promise<文件内容>
  书库写文件: (相对路径: string, 内容: string) => Promise<{ 成功: boolean; 说明: string }>
  /** 知情矩阵（谁知道哪条秘密、什么时候知道）；数据层还没上线时可能是 undefined */
  查知情?: (秘密?: string, 人?: string, 截至章?: number) => Promise<知情结果>
  书库Git状态: () => Promise<{ 有项目: boolean; 是Git仓库: boolean }>
  初始化书库Git: () => Promise<{ 成功: boolean; 说明: string }>
  书架: () => Promise<书架项[]>
  移出书架: (路径: string) => Promise<书架项[]>
  模型清单: () => Promise<string[] | { 错误: string }>
  读取设置: () => Promise<设置>
  保存设置: (设置: 设置) => Promise<设置>
  发送对话: (请求: 对话请求) => Promise<{ 已接收: boolean }>
  中止对话: (请求号: string) => Promise<{ 已中止: boolean }>
  监听对话: (回调: (事件: 对话事件) => void) => () => void
}

/** 有 Electron 外壳就用外壳的桥，否则退回 HTTP 桥（浏览器预览）。 */
export const 桥: 桥接口 = (window as any).桥 ?? 创建网页桥()

export function 计字数(正文: string): number {
  return 正文.replace(/\s/g, "").length
}

export function 千字(数: number): string {
  if (数 < 1000) return 数 + " 字"
  return (数 / 10000).toFixed(1) + " 万字"
}

const 字体族: Record<外观设置["编辑器字体"], string> = {
  宋体: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif',
  黑体: '"SimHei", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  系统: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
}

/**
 * 把任何来源的设置补齐成完整结构：旧版格式、半截数据、缺组缺字段都兜到默认值。
 * 界面永远不该因为「服务端设置结构变了」而白屏。
 */
export function 补齐设置(原始: any): 设置 {
  const 兜 = 默认设置
  const 组 = (值: any, 默认值: any) => ({ ...默认值, ...(值 && typeof 值 === "object" ? 值 : {}) })
  const 源 = 原始 && typeof 原始 === "object" ? 原始 : {}
  return {
    ...兜,
    ...源,
    外观: 组(源.外观, 兜.外观),
    编辑器: 组(源.编辑器, 兜.编辑器),
    模型: 组(源.模型, 兜.模型),
    上下文: 组(源.上下文, 兜.上下文),
    智能体: {
      ...兜.智能体,
      ...(源.智能体 && typeof 源.智能体 === "object" ? 源.智能体 : {}),
      人格: 组(源?.智能体?.人格, 兜.智能体.人格),
      技能: Array.isArray(源?.智能体?.技能) ? 源.智能体.技能 : 兜.智能体.技能,
    },
    书库: 组(源.书库, 兜.书库),
  } as 设置
}

/** 「跟随系统」按系统深浅色解析成 暗 / 亮；米黄是独立的第三套，不参与跟随。 */
/** 把一条问题写进「设定/一致性忽略.md」：写规则名 = 整条规则以后都不报。 */
export async function 记录一致忽略(条目: 一致性问题): Promise<{ 成功: boolean; 说明: string }> {
  const 相对 = "设定/一致性忽略.md"
  const 行 = (条目.规则 ?? "").trim()
  if (!行) return { 成功: false, 说明: "这条没有规则名，忽略不了" }
  let 原文 = ""
  try {
    const 读 = await 桥.书库读文件(相对)
    原文 = 读.是文本 ? 读.文本 : ""
  } catch {
    /* 文件还没有就是空的 */
  }
  const 已有 = 原文
    .split(/\r?\n/)
    .map((行文) => 行文.trim())
    .filter((行文) => 行文 && !行文.startsWith("#"))
  if (已有.includes(行)) return { 成功: true, 说明: "「" + 行 + "」已经在忽略名单里了" }
  const 新文 = (原文.trimEnd() ? 原文.trimEnd() + "\n" : "# 一致性忽略名单：一行一条，# 开头是注释。写规则名 = 整条规则不再报。\n") + 行 + "\n"
  const 写 = await 桥.书库写文件(相对, 新文)
  return { 成功: 写.成功, 说明: 写.成功 ? "已把「" + 行 + "」写进 " + 相对 : 写.说明 }
}

export function 解析主题(主题: 外观设置["主题"]): "米黄" | "暗" | "亮" {
  if (主题 !== "跟随系统") return 主题
  const 深 = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : true
  return 深 ? "暗" : "亮"
}

/** 把外观写进文档：data-* + CSS 变量 + 根级 zoom；顺手缓存一份，下次启动秒开不闪。 */
/** 记缓存=false 用于深链这种一次性外观，别把临时值写进下次启动的缓存。 */
export function 应用外观(外观: 外观设置, 记缓存 = true): void {
  const 根 = document.documentElement
  根.dataset.主题 = 解析主题(外观.主题)
  根.dataset.外观主题 = 外观.主题
  根.dataset.字体 = 外观.编辑器字体
  根.style.setProperty("--界面字号", 外观.界面字号 + "px")
  根.style.setProperty("--编辑字号", 外观.编辑器字号 + "px")
  根.style.setProperty("--行距", String(外观.行距))
  根.style.setProperty("--编辑字体", 字体族[外观.编辑器字体] ?? 字体族.系统)
  根.style.setProperty("--界面缩放", String(外观.界面缩放))
  if (!记缓存) return
  try {
    localStorage.setItem("外观", JSON.stringify(外观))
  } catch {
    /* 存不下也不影响生效 */
  }
}

export function 读缓存外观(): 外观设置 | null {
  try {
    const 存 = localStorage.getItem("外观")
    return 存 ? (JSON.parse(存) as 外观设置) : null
  } catch {
    return null
  }
}

/** 系统深浅色变化时回调（只对「跟随系统」有意义）。返回解绑函数。 */
export function 盯系统主题(回调: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const 媒体 = window.matchMedia("(prefers-color-scheme: dark)")
  const 处理 = () => 回调()
  媒体.addEventListener("change", 处理)
  return () => 媒体.removeEventListener("change", 处理)
}

/** 消息时间：HH:mm；没记时间就不显示。 */
export function 时刻(时间?: number): string {
  if (!时间) return ""
  const 日 = new Date(时间)
  return String(日.getHours()).padStart(2, "0") + ":" + String(日.getMinutes()).padStart(2, "0")
}
