// 只负责一件事：把一章的事实写回台账表格，并留下一个可回滚的 Git 提交。
import path from "node:path"
import { 读文本, 原子写文本 } from "../11 文件工作区/原子写"
import { 提交 } from "../11 文件工作区/Git提交"
import { 记事件 } from "../13 共享黑板/事件日志"
import { 读设置 } from "../14 配置密钥/设置存储"
import { 抽取本章事实 } from "./事实抽取"
import { 找表, 找表们, 列号, 追加行, 找行, 取行, 写行, 删行 } from "./表格改写"

import { 台账册 } from "../10 书库检索/书库布局"

const 时间线 = 台账册.时间线
const 出场追踪 = 台账册.出场追踪
const 承诺台账 = 台账册.承诺台账

export interface 同步参数 {
  根目录: string
  数据目录: string
  章节号: number
  卷号: number
  书名: string
  标题: string
  正文: string
  待兑伏笔: Array<{ 编号: string; 名称: string }>
}

export interface 同步结果 {
  成功: boolean
  说明: string
  改动: string[]
  提交: string
  抽取: { 在场: string[]; 日期: string; 事件: string[]; 已兑现: string[] }
}

function 拆行们(文本: string): { 行们: string[]; 换行: string } {
  const 换行 = 文本.includes("\r\n") ? "\r\n" : "\n"
  return { 行们: 文本.split(/\r?\n/), 换行 }
}

/** 章节列的匹配：ch27 / 27 / 第27章 都算同一章。 */
function 是本章(文本: string, 章节号: number): boolean {
  const 数 = String(章节号)
  return 文本.includes("ch" + 数) || new RegExp("(^|\\D)" + 数 + "(\\D|$)").test(文本)
}

export async function 同步章节台账(参数: 同步参数): Promise<同步结果> {
  const 设置 = 读设置(参数.数据目录)
  const 空结果: 同步结果 = { 成功: false, 说明: "", 改动: [], 提交: "", 抽取: { 在场: [], 日期: "", 事件: [], 已兑现: [] } }

  let 事实
  try {
    事实 = await 抽取本章事实({
      基址: 设置.模型.网关地址,
      密钥: 设置.模型.API密钥,
      模型: 设置.模型.分工.总编,
      书名: 参数.书名,
      章节号: 参数.章节号,
      标题: 参数.标题,
      正文: 参数.正文,
      待兑伏笔: 参数.待兑伏笔.map((项) => 项.编号 + " " + 项.名称),
    })
  } catch (错误: any) {
    return { ...空结果, 说明: "抽取失败：" + String(错误?.message ?? 错误) }
  }

  const 改动: string[] = []
  const 待写: string[] = []

  // ── 时间线：本章一行，重复同步先删旧行再插新行 ──
  if (事实.事件.length > 0) {
    const 文件 = path.join(参数.根目录, 时间线)
    const { 行们, 换行 } = 拆行们(await 读文本(文件).catch(() => ""))
    const 表 = 找表(行们, ["日期", "事件", "章节"])
    if (表) {
      const 章节列 = 列号(表, "章节")
      const 日期列 = 列号(表, "日期")
      const 事件列 = 列号(表, "事件")
      let 删了 = 0
      for (let 序 = 表.末行; 序 >= 表.首行; 序--) {
        const 格们 = 取行(行们, 序)
        if (是本章(格们[章节列] ?? "", 参数.章节号)) {
          删行(行们, 序)
          删了++
        }
      }
      const 新表 = 找表(行们, ["日期", "事件", "章节"])!
      const 行值 = 新表.表头.map((_, 序) =>
        序 === 日期列 ? 事实.日期 || "未记" : 序 === 事件列 ? 事实.事件.join("；") : 序 === 章节列 ? String(参数.章节号) : "",
      )
      追加行(行们, 新表, 行值)
      await 原子写文本(文件, 行们.join(换行))
      待写.push(时间线)
      改动.push("时间线：" + (删了 > 0 ? "替换" : "新增") + " ch" + 参数.章节号 + " 一行（" + 事实.事件.length + " 条事件）")
    }
  }

  // ── 出场追踪：更新在场者的「最后出场」与「出场记录」 ──
  if (事实.在场.length > 0) {
    const 文件 = path.join(参数.根目录, 出场追踪)
    const { 行们, 换行 } = 拆行们(await 读文本(文件).catch(() => ""))
    const 表 = 找表(行们, ["姓名", "最后出场"])
    if (表) {
      const 姓名列 = 列号(表, "姓名")
      const 最后列 = 列号(表, "最后出场")
      const 记录列 = 列号(表, "出场记录")
      let 更新数 = 0
      for (const 人名 of 事实.在场) {
        const 序 = 找行(行们, 表, 姓名列, (值) => {
          const 表名 = 值.replace(/\*/g, "").trim()
          if (!表名) return false
          // 台账里多是全名（丸井三叶），正文里多叫简称（三叶），两边互相包含就算同一人。
          return 表名 === 人名 || 表名.includes(人名) || 人名.includes(表名)
        })
        if (序 < 0) continue
        const 格们 = 取行(行们, 序)
        const 旧最后 = (格们[最后列] ?? "").trim()
        const 新最后 = "第" + 参数.卷号 + "卷/" + String(参数.章节号).padStart(3, "0")
        if (旧最后 === 新最后) continue
        格们[最后列] = 新最后
        if (记录列 >= 0) {
          const 旧记 = (格们[记录列] ?? "").trim()
          if (/^ch1-\d+\s*全程/.test(旧记)) 格们[记录列] = "ch1-" + 参数.章节号 + " 全程"
          else if (旧记 && !旧记.includes("ch" + 参数.章节号)) 格们[记录列] = 旧记 + "、ch" + 参数.章节号
          else if (!旧记) 格们[记录列] = "ch" + 参数.章节号
        }
        写行(行们, 序, 格们)
        更新数++
      }
      if (更新数 > 0) {
        await 原子写文本(文件, 行们.join(换行))
        待写.push(出场追踪)
        改动.push("出场追踪：" + 更新数 + " 人刷新到最后出场 ch" + 参数.章节号)
      }
    }
  }

  // ── 承诺台账：把本章真正兑现的伏笔填上「兑」 ──
  if (事实.已兑现.length > 0) {
    const 文件 = path.join(参数.根目录, 承诺台账)
    const { 行们, 换行 } = 拆行们(await 读文本(文件).catch(() => ""))
    let 命中 = 0
    for (const 条 of 事实.已兑现) {
      for (const 表 of 找表们(行们, ["编号", "承诺", "埋", "兑"])) {
        const 编号列 = 列号(表, "编号")
        const 兑列 = 列号(表, "兑")
        if (编号列 < 0 || 兑列 < 0) continue
        const 备注列 = 表.表头.findIndex((列) => 列.includes("兑了什么") || 列.includes("现状态"))
        const 序 = 找行(行们, 表, 编号列, (值) => 值.replace(/\*/g, "").trim() === 条.编号)
        if (序 < 0) continue
        const 格们 = 取行(行们, 序)
        const 旧兑 = (格们[兑列] ?? "").trim()
        if (旧兑.includes("ch" + 参数.章节号)) break
        // 兑 列原本可能写着计划路径，只追加实际兑现章，绝不覆盖原来的约定。
        const 空值 = 旧兑 === "" || 旧兑 === "—" || 旧兑 === "-"
        格们[兑列] = 空值 ? "ch" + 参数.章节号 : 旧兑 + "、ch" + 参数.章节号
        if (备注列 >= 0 && 条.说明) 格们[备注列] = 条.说明.slice(0, 200)
        写行(行们, 序, 格们)
        命中++
        break
      }
    }
    if (命中 > 0) {
      await 原子写文本(文件, 行们.join(换行))
      待写.push(承诺台账)
      改动.push("承诺台账：" + 命中 + " 条伏笔标记为 ch" + 参数.章节号 + " 兑现")
    }
  }

  if (待写.length === 0) {
    return {
      ...空结果,
      成功: true,
      说明: "本章没有可入账的变化",
      抽取: { 在场: 事实.在场, 日期: 事实.日期, 事件: 事实.事件, 已兑现: 事实.已兑现.map((x) => x.编号) },
    }
  }

  const 提交结果 = await 提交(
    参数.根目录,
    "台账同步 ch" + 参数.章节号 + "《" + 参数.标题 + "》",
    待写,
  )
  记事件(参数.数据目录, 参数.根目录, {
    时间: new Date().toISOString(),
    类型: "台账同步",
    章节: 参数.章节号,
    发起者: "总编智能体",
    摘要: 改动.join("；") + "；" + 提交结果.说明,
    细节: { 在场: 事实.在场, 已兑现: 事实.已兑现 },
  })

  return {
    成功: true,
    说明: 改动.join("；") + "；" + 提交结果.说明,
    改动,
    提交: 提交结果.说明,
    抽取: { 在场: 事实.在场, 日期: 事实.日期, 事件: 事实.事件, 已兑现: 事实.已兑现.map((x) => x.编号) },
  }
}
