// 只负责一件事：实现每个通道背后的业务。主进程与浏览器预览共用这一份，杜绝两套逻辑。
import path from "node:path"
import { 通道 } from "../03 进程桥接/通道"
import type { 项目摘要, 看板数据, 设置, 对话请求, 续写请求, 改写请求, 书架项, 文件节点, 文件树结果, 文件内容 } from "../03 进程桥接/通道"
import { 扫描项目 } from "../10 书库检索/项目扫描"
import { 装配看板 } from "../10 书库检索/看板装配"
import { 读文本, 原子写文本, 存在, 列目录 } from "../11 文件工作区/原子写"
import { 提交 } from "../11 文件工作区/Git提交"
import { 读设置, 写设置 } from "../14 配置密钥/设置存储"
import { 记事件 } from "../13 共享黑板/事件日志"
import { 拉模型清单, 流式对话, 取调用策略 } from "../04 模型接入/网关客户端"
import { 组装系统提示 } from "../05 编排内核/章节提示词"
import { 同步章节台账 } from "../09 台账同步/同步台账"
import { 路径, 派活归档, 计划 } from "../10 书库检索/书库布局"
import { 导入旧书库 } from "../16 书库迁移/导入旧书库"
import { 抽建议, 写建议文件, 读全部建议 } from "../17 建议审阅/待裁定建议"
import { 生成集群, 读集群, 存集群 } from "../06 智能体运行时/成员目录"
import type { 集群成员 } from "../06 智能体运行时/成员目录"
import { 派活, 选阵容 } from "../05 编排内核/集群调度"
import { 生成导出 } from "../12 导出转换/导出正文"
import os from "node:os"
import fs from "node:fs"

export type 通道处理 = Record<string, (...参数: any[]) => Promise<any>>

function 读书架(数据目录: string): 书架项[] {
  try {
    const 全部 = JSON.parse(fs.readFileSync(path.join(数据目录, "书架.json"), "utf8"))
    return Array.isArray(全部) ? (全部 as 书架项[]) : []
  } catch {
    return []
  }
}

function 写书架(数据目录: string, 项们: 书架项[]): 书架项[] {
  fs.mkdirSync(数据目录, { recursive: true })
  const 裁剪 = 项们.slice(0, 12)
  fs.writeFileSync(path.join(数据目录, "书架.json"), JSON.stringify(裁剪, null, 2), "utf8")
  return 裁剪
}

function 记书架(数据目录: string, 项目: 项目摘要): void {
  const 旧 = 读书架(数据目录).filter((项) => 项.路径 !== 项目.路径)
  写书架(数据目录, [{ 路径: 项目.路径, 书名: 项目.书名, 最后打开: new Date().toISOString() }, ...旧])
}

/** 只认书库内的相对路径：不许 ..、不许绝对路径、不许盘符，拼完必须仍落在书库根里。 */
function 书内路径(根: string, 相对: string): string {
  const 净 = String(相对 ?? "").replace(/\\/g, "/").trim()
  if (!净) throw new Error("路径为空")
  if (净.startsWith("/") || /^[a-zA-Z]:/.test(净)) throw new Error("只接受书库内的相对路径")
  if (净.split("/").some((段) => 段 === "" || 段 === "." || 段 === "..")) throw new Error("路径里不能带 . 或 ..")
  const 根解 = path.resolve(根)
  const 拼 = path.resolve(根解, 净)
  if (拼 === 根解 || !拼.startsWith(根解 + path.sep)) throw new Error("路径越界：" + 相对)
  return 拼
}

const 文本后缀 = new Set([".md", ".txt", ".yaml", ".yml", ".json", ".csv", ".xml", ".html", ".css", ".js", ".ts", ".toml"])

/** 递归列书库：深度 6、条目 2000 封顶，隐藏文件（含 .git）不列。 */
async function 读书库树(根: string): Promise<文件树结果> {
  let 已数 = 0
  let 截断 = false
  const 走 = async (目录: string, 深: number): Promise<文件节点[]> => {
    if (深 > 6 || 截断) return []
    const 项们 = (await 列目录(目录).catch(() => []))
      .filter((项) => !项.名称.startsWith("."))
      .sort((甲, 乙) => (甲.是目录 === 乙.是目录 ? 甲.名称.localeCompare(乙.名称, "zh") : 甲.是目录 ? -1 : 1))
    const 结果: 文件节点[] = []
    for (const 项 of 项们) {
      if (已数 >= 2000) {
        截断 = true
        break
      }
      已数++
      const 绝 = path.join(目录, 项.名称)
      const 相对 = path.relative(根, 绝).split(path.sep).join("/")
      if (项.是目录) {
        结果.push({ 名称: 项.名称, 相对路径: 相对, 是目录: true, 大小: 0, 子: await 走(绝, 深 + 1) })
      } else {
        const 信息 = await fs.promises.stat(绝).catch(() => null)
        结果.push({ 名称: 项.名称, 相对路径: 相对, 是目录: false, 大小: 信息?.size ?? 0 })
      }
    }
    return 结果
  }
  const 树 = await 走(path.resolve(根), 1)
  return { 树, 截断 }
}

export interface 处理器集 {
  状态: { 项目: 项目摘要 | null; 看板: 看板数据 | null }
  处理: 通道处理
  流式: (请求: 对话请求, 回调: (类型: "思考" | "正文", 文本: string) => void, 信号?: AbortSignal) => Promise<string>
  中止: (请求号: string) => boolean
  派活: (任务: string, 编号: number, 回调?: (事件: any) => void) => Promise<any>
  取集群: () => Promise<集群成员[]>
  续写: (请求: 续写请求, 回调: (类型: "思考" | "正文", 文本: string) => void) => Promise<string>
  改写: (请求: 改写请求, 回调: (类型: "思考" | "正文", 文本: string) => void) => Promise<string>
}

export function 创建请求处理(
  数据目录: string,
  选目录?: () => Promise<string | null>,
  另存?: (建议文件名: string, 数据: Buffer) => Promise<string>,
): 处理器集 {
  const 状态: 处理器集["状态"] = { 项目: null, 看板: null }
  const 进行中 = new Map<string, AbortController>()

  async function 装载(根: string): Promise<项目摘要> {
    const 项目 = await 扫描项目(根)
    状态.项目 = 项目
    状态.看板 = await 装配看板(根, 项目.统计.最新章节)
    写设置(数据目录, { ...读设置(数据目录), 书库: { 上次路径: 根 } })
    记书架(数据目录, 项目)
    return 项目
  }

  const 处理: 通道处理 = {
    [通道.打开项目]: async (传入路径: string) => {
      let 根 = (传入路径 ?? "").trim()
      if (!根) {
        if (!选目录) return null
        根 = (await 选目录()) ?? ""
      }
      if (!根) return null
      return 装载(根)
    },

    [通道.当前项目]: async () => {
      if (状态.项目) return 状态.项目
      const 记住的路径 = 读设置(数据目录).书库.上次路径
      if (!记住的路径) return null
      if (!(await 存在(path.join(记住的路径, 路径.清单)))) return null
      return 装载(记住的路径)
    },

    [通道.读取章节]: async (编号: number) => {
      if (!状态.项目) throw new Error("尚未打开书库")
      for (const 卷 of 状态.项目.卷) {
        const 章 = 卷.章节.find((x) => x.编号 === 编号)
        if (!章) continue
        return { 编号, 标题: 章.标题, 正文: await 读文本(path.join(状态.项目.路径, 章.文件)) }
      }
      throw new Error("没有第 " + 编号 + " 章")
    },

    [通道.保存章节]: async (编号: number, 正文: string) => {
      if (!状态.项目) return { 成功: false, 说明: "尚未打开书库" }
      for (const 卷 of 状态.项目.卷) {
        const 章 = 卷.章节.find((x) => x.编号 === 编号)
        if (!章) continue
        const 相对 = 章.文件
        await 原子写文本(path.join(状态.项目.路径, 相对), 正文)
        章.字数 = 正文.replace(/\s/g, "").length
        const 提交结果 = await 提交(状态.项目.路径, "同步 ch" + 编号 + "《" + 章.标题 + "》", [相对])
        记事件(数据目录, 状态.项目.路径, {
          时间: new Date().toISOString(),
          类型: "正文保存",
          章节: 编号,
          发起者: "作者",
          摘要: "保存第 " + 编号 + " 章，" + 章.字数 + " 字；" + 提交结果.说明,
        })
        状态.看板 = await 装配看板(状态.项目.路径, 状态.项目.统计.最新章节)
        return { 成功: true, 说明: "已保存 " + 章.字数 + " 字；" + 提交结果.说明 }
      }
      return { 成功: false, 说明: "找不到该章" }
    },

    [通道.读取看板]: async () => {
      if (!状态.项目) {
        return { 最新章节: 0, 伏笔: [], 统计: { 总数: 0, 已兑现: 0, 待兑现: 0, 超期: 0, 久置: 0 }, 台账: [], 待裁定: [] }
      }
      if (!状态.看板) 状态.看板 = await 装配看板(状态.项目.路径, 状态.项目.统计.最新章节)
      // 待裁定每次现读：只是几个很小的 md，派活刚落地就该立刻反映到界面上。
      return { ...状态.看板, 待裁定: 读全部建议(状态.项目.路径) }
    },

    [通道.台账同步]: async (章节号: number) => {
      if (!状态.项目) return { 成功: false, 说明: "尚未打开书库", 改动: [], 提交: "", 抽取: { 在场: [], 日期: "", 事件: [], 已兑现: [] } }
      for (const 卷 of 状态.项目.卷) {
        const 章 = 卷.章节.find((x) => x.编号 === 章节号)
        if (!章) continue
        const 正文 = await 读文本(path.join(状态.项目.路径, 章.文件))
        const 结果 = await 同步章节台账({
          根目录: 状态.项目.路径,
          数据目录,
          章节号,
          卷号: 卷.编号,
          书名: 状态.项目.书名,
          标题: 章.标题,
          正文,
          待兑伏笔: (状态.看板?.伏笔 ?? []).filter((x) => x.状态 !== "已兑现").map((x) => ({ 编号: x.编号, 名称: x.名称 })),
        })
        状态.看板 = await 装配看板(状态.项目.路径, 状态.项目.统计.最新章节)
        return 结果
      }
      return { 成功: false, 说明: "找不到该章", 改动: [], 提交: "", 抽取: { 在场: [], 日期: "", 事件: [], 已兑现: [] } }
    },

    [通道.集群成员]: async (): Promise<集群成员[]> => 取集群(),

    [通道.集群删除]: async (id: string): Promise<集群成员[]> => {
      if (!状态.项目) return []
      const 剩余 = (await 取集群()).filter((x) => x.id !== id)
      存集群(数据目录, 状态.项目.路径, 剩余)
      return 剩余
    },

    [通道.集群改]: async (id: string, 名称: string, 职责: string, 管辖文本: string): Promise<集群成员[]> => {
      if (!状态.项目) return []
      const 全部 = (await 取集群()).map((成员) =>
        成员.id === id
          ? {
              ...成员,
              名称: 名称 || 成员.名称,
              人格: 职责 || 成员.人格,
              管辖: String(管辖文本 ?? "")
                .split(/[,\n，、]/)
                .map((x) => x.trim())
                .filter(Boolean),
            }
          : 成员,
      )
      存集群(数据目录, 状态.项目.路径, 全部)
      return 全部
    },

    [通道.集群新建]: async (名称: string, 职责: string, 管辖文本: string): Promise<集群成员[]> => {
      if (!状态.项目) return []
      const 现有 = await 取集群()
      const 新成员: 集群成员 = {
        id: "自-" + 名称,
        名称,
        角色: "自定义",
        管辖: String(管辖文本 ?? "")
          .split(/[,\n，、]/)
          .map((x) => x.trim())
          .filter(Boolean),
        人格: 职责 || "你是作者自建的智能体，按作者给的要求办事。",
        状态: "待命",
        最近: "",
      }
      const 全部 = [...现有.filter((x) => x.id !== 新成员.id), 新成员]
      存集群(数据目录, 状态.项目.路径, 全部)
      return 全部
    },

    [通道.书库导入]: async (旧根传入: string, 新根传入: string) => {
      let 旧根 = (旧根传入 ?? "").trim()
      let 新根 = (新根传入 ?? "").trim()
      if (!旧根) 旧根 = (await 选目录?.()) ?? ""
      if (!旧根) return { 成功: false, 说明: "没有选择旧书库目录" }
      if (!新根) 新根 = (await 选目录?.()) ?? ""
      if (!新根) return { 成功: false, 说明: "没有选择新书库目录" }
      return 导入旧书库(旧根, 新根)
    },

    [通道.书库文件树]: async (): Promise<文件树结果> => {
      if (!状态.项目) return { 树: [], 截断: false }
      return 读书库树(状态.项目.路径)
    },

    [通道.书库读文件]: async (相对路径: string): Promise<文件内容> => {
      if (!状态.项目) throw new Error("尚未打开书库")
      const 绝 = 书内路径(状态.项目.路径, 相对路径)
      const 信息 = await fs.promises.stat(绝).catch(() => null)
      if (!信息 || 信息.isDirectory()) throw new Error("不是可读的文件：" + 相对路径)
      if (信息.size > 2 * 1024 * 1024) throw new Error("文件超过 2MB，界面里不打开")
      const 是文本 = 文本后缀.has(path.extname(绝).toLowerCase())
      return { 相对路径, 文本: 是文本 ? await 读文本(绝) : "", 大小: 信息.size, 是文本 }
    },

    [通道.书库写文件]: async (相对路径: string, 内容: string) => {
      if (!状态.项目) return { 成功: false, 说明: "尚未打开书库" }
      const 绝 = 书内路径(状态.项目.路径, 相对路径)
      if (Buffer.byteLength(内容 ?? "", "utf8") > 2 * 1024 * 1024) return { 成功: false, 说明: "内容超过 2MB，没有写入" }
      const 规范 = path.relative(状态.项目.路径, 绝).split(path.sep).join("/")
      await 原子写文本(绝, 内容)
      const 提交结果 = await 提交(状态.项目.路径, "编辑 " + 规范, [规范])
      记事件(数据目录, 状态.项目.路径, {
        时间: new Date().toISOString(),
        类型: "文件保存",
        发起者: "作者",
        摘要: "保存 " + 规范 + "；" + 提交结果.说明,
      })
      状态.看板 = await 装配看板(状态.项目.路径, 状态.项目.统计.最新章节)
      return { 成功: true, 说明: "已保存 " + 规范 + "；" + 提交结果.说明 }
    },

    [通道.导出]: async (格式: string) => {
      if (!状态.项目) return { 成功: false, 说明: "尚未打开书库", 路径: "" }
      const 章们: Array<{ 编号: number; 标题: string; 正文: string; 卷号?: number }> = []
      for (const 卷 of 状态.项目.卷) {
        for (const 章 of 卷.章节) {
          if (!章.文件) continue
          const 正文 = await 读文本(path.join(状态.项目.路径, 章.文件)).catch(() => "")
          章们.push({ 编号: 章.编号, 标题: 章.标题, 正文, 卷号: 卷.编号 })
        }
      }
      try {
        const 成品 = 生成导出(格式, 状态.项目.书名, 章们)
        const 落地 = 另存
          ? await 另存(成品.文件名, 成品.数据)
          : await (async () => {
              const 目录 = path.join(os.homedir(), "Downloads")
              fs.mkdirSync(目录, { recursive: true })
              const 文件 = path.join(目录, 成品.文件名)
              fs.writeFileSync(文件, 成品.数据)
              return 文件
            })()
        return { 成功: true, 说明: "已导出 " + 章们.length + " 章 → " + 落地, 路径: 落地 }
      } catch (错误: any) {
        return { 成功: false, 说明: "导出失败：" + String(错误?.message ?? 错误), 路径: "" }
      }
    },

    [通道.书架]: async (): Promise<书架项[]> =>
      读书架(数据目录).filter((项) => fs.existsSync(path.join(项.路径, 路径.清单))),

    [通道.书架移除]: async (书路径: string): Promise<书架项[]> =>
      写书架(数据目录, 读书架(数据目录).filter((项) => 项.路径 !== 书路径)),

    [通道.模型清单]: async () => {
      const 设置 = 读设置(数据目录)
      try {
        return await 拉模型清单(设置.模型.网关地址, 设置.模型.API密钥, 设置.模型.超时秒)
      } catch (错误: any) {
        return { 错误: String(错误?.message ?? 错误) }
      }
    },

    [通道.读取设置]: async () => 读设置(数据目录),

    [通道.保存设置]: async (新设置: 设置) => 写设置(数据目录, 新设置),
  }

  async function 流式(请求: 对话请求, 回调: (类型: "思考" | "正文", 文本: string) => void, 信号?: AbortSignal): Promise<string> {
    const 设置 = 读设置(数据目录)
    const 系统 = 请求.系统提示 || 组装系统提示({
      书名: 状态.项目?.书名 ?? "未命名作品",
      章节号: 0,
      章节标题: "创作讨论",
      伏笔: 状态.看板?.伏笔 ?? [],
      正文尾部: "",
    })
    const 控制器 = new AbortController()
    进行中.set(请求.请求号, 控制器)
    try {
      return await 流式对话({
        ...取调用策略(设置.模型),
        基址: 设置.模型.网关地址,
        密钥: 设置.模型.API密钥,
        模型: 请求.模型,
        消息: [
          { role: "system", content: 系统 },
          { role: "user", content: 请求.用户输入 },
        ],
        温度: 请求.温度 ?? 设置.模型.温度,
        信号: 信号 ?? 控制器.signal,
        回调,
      })
    } finally {
      进行中.delete(请求.请求号)
    }
  }

  async function 取集群(): Promise<集群成员[]> {
    if (!状态.项目) return []
    let 成员们 = 读集群(数据目录, 状态.项目.路径)
    if (成员们.length === 0) {
      成员们 = await 生成集群(状态.项目.路径, 状态.项目.书名, 读设置(数据目录).智能体.人格)
      存集群(数据目录, 状态.项目.路径, 成员们)
    }
    return 成员们
  }

  /** 改写：给一段原文 + 一句意见，只回改写后的正文。多轮就是拿上一版再改一次。 */
  async function 改写流(请求: 改写请求, 回调: (类型: "思考" | "正文", 文本: string) => void) {
    const 设置 = 读设置(数据目录)
    const 系统 = [
      "你是《" + (状态.项目?.书名 ?? "未命名作品") + "》的执笔，正在改第 " + 请求.章节号 + " 章《" + 请求.标题 + "》。",
      "",
      "任务：按作者的修改意见重写给定片段。",
      "铁律：",
      "1. 只输出改写后的正文本身——不要解释、不要评价、不要用引号或代码块包起来。",
      "2. 保持原文的篇幅量级与叙事视角，除非作者明确要求改动。",
      "3. 段落用两个全角空格开头，对话用中文引号。",
      "4. 事实以原文为准，不要新增设定、不要补人名地名。",
    ].join("\n")

    const 用户 = [
      "【要改的原文】",
      请求.原文,
      "",
      请求.前文 ? "【上文（只用于衔接，不要改写）】\n" + 请求.前文.slice(-600) : "",
      请求.后文 ? "【下文（只用于衔接，不要改写）】\n" + 请求.后文.slice(0, 600) : "",
      "",
      "【作者意见】" + (请求.指令 || "让它更紧、更具体，删掉多余的解释。"),
    ].filter(Boolean).join("\n")

    const 控制器 = new AbortController()
    进行中.set(请求.请求号, 控制器)
    try {
      return await 流式对话({
        基址: 设置.模型.网关地址,
        密钥: 设置.模型.API密钥,
        ...取调用策略(设置.模型),
        模型: 请求.模型 || 设置.模型.分工.执笔,
        消息: [
          { role: "system", content: 系统 },
          { role: "user", content: 用户 },
        ],
        温度: 0.85,
        信号: 控制器.signal,
        回调,
      })
    } finally {
      进行中.delete(请求.请求号)
    }
  }

  async function 续写流(请求: 续写请求, 回调: (类型: "思考" | "正文", 文本: string) => void) {
    const 设置 = 读设置(数据目录)
    const 系统 = [
      组装系统提示({
        书名: 状态.项目?.书名 ?? "未命名作品",
        章节号: 请求.章节号,
        章节标题: 请求.标题,
        伏笔: 状态.看板?.伏笔 ?? [],
        正文尾部: 请求.已有正文,
      }),
      "",
      "【续写任务】",
      "从正文断点直接往下写，不要复述已有内容，不要解释，不要小标题，不要写「续写如下」。",
      "每段以两个全角空格开头（　　），对话用中文引号。",
    ].join("\n")

    const 控制器 = new AbortController()
    进行中.set(请求.请求号, 控制器)
    try {
      return await 流式对话({
        ...取调用策略(设置.模型),
        基址: 设置.模型.网关地址,
        密钥: 设置.模型.API密钥,
        模型: 请求.模型 || 设置.模型.分工.执笔,
        信号: 控制器.signal,
        消息: [
          { role: "system", content: 系统 },
          { role: "user", content: 请求.指令?.trim() || "接着往下写，大约 600 字。" },
        ],
        回调,
      })
    } finally {
      进行中.delete(请求.请求号)
    }
  }

  /** 开写包落盘：每章一份，覆盖更新；AI 产出统一进「计划/」，与 canon 分开。 */
  async function 落开写包(章号: number, 标题: string, 任务: string, 结果: any): Promise<string> {
    const 相对 = 计划.开写包 + "/第" + String(章号).padStart(3, "0") + "章 开写包.md"
    const 文件 = path.join(状态.项目!.路径, 相对)
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 正文 = [
      "# 第 " + 章号 + " 章《" + 标题 + "》· 开写包",
      "",
      "> 由智能体集群生成于 " + new Date().toLocaleString("zh-CN") + "，任务：" + 任务,
      "> 本章最新一版，重跑会覆盖。原始回答见讨论区。",
      "",
      String(结果.汇总 ?? "").trim(),
      "",
    ].join("\n")
    fs.writeFileSync(文件, 正文, "utf8")
    return 相对
  }

  /** 派活结果归档：讨论区留全过程，情节区留可用的开写包。 */
  async function 归档派活(任务: string, 章号: number, 标题: string, 结果: any) {
    if (!状态.项目) return
    const 相对 = 派活归档
    const 文件 = path.join(状态.项目.路径, 相对)
    const 已有 = fs.existsSync(文件)
    const 段: string[] = []
    if (!已有) {
      段.push("# 智能体派活记录", "", "> 由集群自动追加，仅供追溯，**不作写作依据**。", "")
    }
    段.push(
      "## " + new Date().toLocaleString("zh-CN") + " ｜ ch" + 章号 + "《" + 标题 + "》",
      "",
      "**任务**：" + 任务,
      "",
      "**开写包**",
      "",
      String(结果.汇总 ?? "").trim(),
      "",
      "<details><summary>各成员原始回答（" + (结果.各自?.length ?? 0) + "）</summary>",
      "",
      ...(结果.各自 ?? []).map((项: any) => "- **" + 项.成员 + "**（" + 项.角色 + "）：" + String(项.产出).replace(/\n+/g, " / ")),
      "",
      "</details>",
      "",
    )
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    fs.appendFileSync(文件, (已有 ? "\n" : "") + 段.join("\n"), "utf8")
    const 开写包路径 = await 落开写包(章号, 标题, 任务, 结果)
    const 建议路径 = 写建议文件(状态.项目.路径, 章号, 标题, 抽建议(结果.各自 ?? []))
    await 提交(状态.项目.路径, "派活归档 + 开写包 + 待裁定建议 ch" + 章号, [相对, 开写包路径, 建议路径])
  }

  async function 派活流(任务: string, 编号: number, 回调?: (事件: any) => void) {
    if (!状态.项目) return { 任务, 用时毫秒: 0, 各自: [], 汇总: "尚未打开书库" }
    const 设置 = 读设置(数据目录)
    const 成员们 = 选阵容(await 取集群(), 设置.智能体.阵容上限)
    const 章号 = 编号 || 状态.项目.统计.最新章节
    let 标题 = ""
    for (const 卷 of 状态.项目.卷) {
      const 章 = 卷.章节.find((x) => x.编号 === 章号)
      if (章) {
        标题 = 章.标题
        break
      }
    }
    const 结果 = await 派活({
      根目录: 状态.项目.路径,
      数据目录,
      书名: 状态.项目.书名,
      章节号: 章号,
      章节标题: 标题,
      任务,
      成员们,
      设置,
      回调,
    })
    try {
      await 归档派活(任务, 章号, 标题, 结果)
    } catch (错误: any) {
      console.error("[派活] 归档失败：" + String(错误?.message ?? 错误))
    }
    return 结果
  }

  return {
    状态,
    处理,
    流式,
    派活: 派活流,
    取集群,
    续写: 续写流,
    改写: 改写流,
    中止: (请求号: string) => {
      const 控制器 = 进行中.get(请求号)
      if (!控制器) return false
      控制器.abort()
      return true
    },
  }
}
