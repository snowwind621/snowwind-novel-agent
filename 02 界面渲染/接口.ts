// 只负责一件事：给界面提供强类型的「桥」入口与共用小工具。
import type { 项目摘要, 看板数据, 设置, 外观设置, 编辑器设置, 模型设置, 上下文设置, 智能体设置, 书库设置, 技能项, 对话请求, 章节摘要, 待裁定章, 待裁定条目, 文件节点, 文件树结果, 文件内容, 用量 } from "../03 进程桥接/通道"
import { 创建网页桥 } from "./网页桥"
import { 默认设置 } from "../14 配置密钥/默认设置"

export { 默认设置 }

export type { 项目摘要, 看板数据, 设置, 外观设置, 编辑器设置, 模型设置, 上下文设置, 智能体设置, 书库设置, 技能项, 对话请求, 章节摘要, 待裁定章, 待裁定条目, 文件节点, 文件树结果, 文件内容, 用量 }

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
  条目: 知情条目[]
  秘密们: string[]
  人: string[]
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
  保存章节: (编号: number, 正文: string) => Promise<{ 成功: boolean; 说明: string }>
  读取看板: () => Promise<看板数据>
  台账同步: (章节号: number) => Promise<同步结果>
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

/** 「跟随系统」按系统深浅色解析成 暗 / 亮。 */
export function 解析主题(主题: 外观设置["主题"]): "暗" | "亮" {
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
