// 只负责一件事：给界面提供强类型的「桥」入口与共用小工具。
import type { 项目摘要, 看板数据, 设置, 对话请求, 章节摘要 } from "../03 进程桥接/通道"
import { 创建网页桥 } from "./网页桥"

export type { 项目摘要, 看板数据, 设置, 对话请求, 章节摘要 }

export interface 对话事件 {
  请求号: string
  类型: "思考" | "正文" | "结束" | "错误"
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
