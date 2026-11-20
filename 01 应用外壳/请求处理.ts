// 只负责一件事：实现每个通道背后的业务。主进程与浏览器预览共用这一份，杜绝两套逻辑。
import path from "node:path"
import { 通道 } from "../03 进程桥接/通道"
import type { 项目摘要, 看板数据, 设置, 对话请求, 续写请求, 改写请求, 书架项, 文件节点, 文件树结果, 文件内容 } from "../03 进程桥接/通道"
import { 扫描项目 } from "../10 书库检索/项目扫描"
import { 装配看板 } from "../10 书库检索/看板装配"
import { 读文本, 原子写文本, 存在, 列目录 } from "../11 文件工作区/原子写"
import { 提交, 是Git仓库, 初始化仓库 } from "../11 文件工作区/Git提交"
import { 读设置, 写设置 } from "../14 配置密钥/设置存储"
import { 记事件 } from "../13 共享黑板/事件日志"
import { 拉模型清单, 流式对话, 流式对话带工具, 取调用策略 } from "../04 模型接入/网关客户端"
import type { 对话消息 } from "../04 模型接入/网关客户端"
import { 工具声明们, 跑工具, 解析约定块, 已确认, 按名找 } from "../06 智能体运行时/工具执行"
import { 执行成员 } from "../06 智能体运行时/执行器"
import { 投影台账, 投影设定, 投影伏笔, 投影知情 } from "../06 智能体运行时/书库投影"
import type { 工具环境 } from "../06 智能体运行时/工具执行"
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
  流式: (
    请求: 对话请求,
    回调: (类型: "思考" | "正文" | "用量" | "工具" | "提问" | "计划", 文本: string) => void,
    信号?: AbortSignal,
  ) => Promise<string>
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
    写设置(数据目录, { ...读设置(数据目录), 书库: { ...读设置(数据目录).书库, 上次路径: 根 } })
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
        return {
          成功: true,
          说明: "已保存 " + 章.字数 + " 字；" + 提交结果.说明,
          ...(提交结果.不是Git仓库 ? { 不是Git仓库: true } : {}),
        }
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
        // 书库不是 Git 仓库时提交会被跳过：把这件事回给界面，让它问作者要不要初始化
        return { ...结果, ...(await 是Git仓库(状态.项目.路径) ? {} : { 不是Git仓库: true }) }
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

    [通道.书库查知情]: async (秘密?: string, 人?: string, 截至章?: number) => {
      if (!状态.项目) return { 有台账: false, 秘密: [], 候选: [], 说明: "尚未打开书库" }
      const 全 = 投影知情(状态.项目.路径, 截至章 && 截至章 > 0 ? 截至章 : undefined)
      if (!秘密 && !人) return 全
      const 秘密们 = 全.秘密.filter((项: any) => {
        const 命中秘密 = 秘密 ? String(项.名称).includes(秘密) : true
        const 命中人 = 人 ? [...项.知情.map((x: any) => x.人), ...项.不知情].some((名: any) => String(名).includes(人)) : true
        return 命中秘密 && 命中人
      })
      return { ...全, 秘密: 秘密们 }
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

    [通道.书库Git状态]: async () => {
      if (!状态.项目) return { 有项目: false, 是Git仓库: false }
      return { 有项目: true, 是Git仓库: await 是Git仓库(状态.项目.路径) }
    },

    /** 只有作者在界面上点「初始化」才会走到这里；不点就永远不建。 */
    [通道.书库初始化Git]: async () => {
      if (!状态.项目) return { 成功: false, 说明: "尚未打开书库" }
      const 根 = 状态.项目.路径
      const 结果 = await 初始化仓库(根)
      if (!结果.成功) return 结果
      const 时 = new Date()
      const 相对 = 路径.留痕 + "/留痕-99-初始化Git-" + 时.toISOString().slice(0, 10) + ".md"
      const 文件 = path.join(根, 相对)
      fs.mkdirSync(path.dirname(文件), { recursive: true })
      fs.writeFileSync(
        文件,
        [
          "# 初始化 Git",
          "",
          "> " + 时.toLocaleString("zh-CN") + "：作者在界面上点了「初始化」，这本书从此纳入版本管理。",
          "> 从这一刻起，正文与台账的每次写入都会自动提交，可回滚。",
          "",
        ].join("\n"),
        "utf8",
      )
      const 提交结果 = await 提交(根, "初始化 Git：记一笔", [相对])
      记事件(数据目录, 根, {
        时间: 时.toISOString(),
        类型: "书库初始化Git",
        发起者: "作者",
        摘要: 结果.说明 + "；" + 提交结果.说明,
      })
      return { 成功: true, 说明: 结果.说明 + "；留痕已记：" + 相对 }
    },

    [通道.读取设置]: async () => 读设置(数据目录),

    [通道.保存设置]: async (新设置: 设置) => 写设置(数据目录, 新设置),
  }

  /** 拿一章的标题与正文（读不到就空串）——给工具用，不抛错。 */
  async function 取章与正文(章节号: number): Promise<{ 标题: string; 正文: string }> {
    if (!状态.项目) return { 标题: "", 正文: "" }
    for (const 卷 of 状态.项目.卷) {
      const 章 = 卷.章节.find((x) => x.编号 === 章节号)
      if (!章) continue
      const 正文 = await 读文本(path.join(状态.项目.路径, 章.文件)).catch(() => "")
      return { 标题: 章.标题, 正文 }
    }
    return { 标题: "", 正文: "" }
  }

  /** 工具用的续写：不碰界面回调，只把正文拿回来。 */
  async function 续写给工具(章节号: number, 指令: string, 字数上限: number): Promise<string> {
    const 设置 = 读设置(数据目录)
    const { 标题, 正文 } = await 取章与正文(章节号)
    const 系统 = [
      组装系统提示({
        书名: 状态.项目?.书名 ?? "未命名作品",
        章节号,
        章节标题: 标题 || "第" + 章节号 + "章",
        伏笔: 状态.看板?.伏笔 ?? [],
        正文尾部: 正文,
      }),
      "",
      "【续写任务】",
      "从正文断点直接往下写，不要复述已有内容，不要解释，不要小标题。",
      "每段以两个全角空格开头（　　），对话用中文引号。",
    ].join("\n")
    return await 流式对话({
      ...取调用策略(设置.模型),
      基址: 设置.模型.网关地址,
      密钥: 设置.模型.API密钥,
      模型: 设置.模型.分工.执笔,
      消息: [
        { role: "system", content: 系统 },
        { role: "user", content: 指令?.trim() || "接着往下写，大约 " + Math.max(100, 字数上限) + " 字。" },
      ],
      最大词元: Math.min(8000, Math.max(512, Math.round(字数上限 * 2))),
      回调: () => {},
    })
  }

  /** 工具用的改写：同样只回正文。 */
  async function 改写给工具(章节号: number, 原文: string, 要求: string): Promise<string> {
    const 设置 = 读设置(数据目录)
    const { 标题 } = await 取章与正文(章节号)
    const 系统 = [
      "你是《" + (状态.项目?.书名 ?? "未命名作品") + "》的执笔，正在改第 " + 章节号 + " 章《" + (标题 || "第" + 章节号 + "章") + "》里的一段。",
      "只输出改写后的正文本身，不要解释、不要加引号或代码块；保持篇幅量级与叙事视角；每段以两个全角空格开头。",
    ].join("\n")
    return await 流式对话({
      ...取调用策略(设置.模型),
      基址: 设置.模型.网关地址,
      密钥: 设置.模型.API密钥,
      模型: 设置.模型.分工.执笔,
      消息: [
        { role: "system", content: 系统 },
        { role: "user", content: "【要改的原文】\n" + 原文 + "\n\n【作者要求】" + 要求 },
      ],
      温度: 0.85,
      回调: () => {},
    })
  }

  /** 建计划：落一张表进 计划/计划表/，执行结果列由系统回填。 */
  async function 落计划表(
    标题: string,
    目标: string,
    步骤们: Array<{ 动作: string; 目标文件: string; 说明: string }>,
    涉及章节: string,
  ): Promise<{ 路径: string; 步骤数: number }> {
    if (!状态.项目) throw new Error("尚未打开书库")
    const 日期 = new Date().toISOString().slice(0, 10)
    const 干净 = 标题.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "计划"
    const 相对 = 计划.计划表 + "/" + 日期 + " " + 干净 + ".md"
    const 文件 = path.join(状态.项目.路径, 相对)
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 确认词 = 读设置(数据目录).智能体.计划确认词
    const 行们 = [
      "# " + 标题,
      "",
      "> 目标：" + 目标,
      "> 涉及章节：" + (涉及章节 || "—"),
      "> 生成于 " + new Date().toLocaleString("zh-CN") + "；执行结果列由系统回填，作者说「" + 确认词 + "」后才逐条执行。",
      "",
      "| 序号 | 动作 | 目标文件 | 说明 | 执行结果 |",
      "| --- | --- | --- | --- | --- |",
      ...步骤们.map((步, 序) => "| " + (序 + 1) + " | " + 步.动作 + " | " + 步.目标文件 + " | " + 步.说明.replace(/\|/g, "／") + " |  |"),
      "",
    ]
    await 原子写文本(文件, 行们.join("\n"))
    await 提交(状态.项目.路径, "建计划：" + 标题, [相对])
    记事件(数据目录, 状态.项目.路径, { 时间: new Date().toISOString(), 类型: "建计划", 发起者: "总控", 摘要: 标题 + "（" + 步骤们.length + " 步）" })
    return { 路径: 相对, 步骤数: 步骤们.length }
  }

  /** 找最新的、还有空执行结果的计划表。 */
  function 找待执行计划() {
    if (!状态.项目) return null
    const 目录 = path.join(状态.项目.路径, 计划.计划表)
    let 名们: string[] = []
    try {
      名们 = fs
        .readdirSync(目录)
        .filter((名) => 名.endsWith(".md"))
        .sort((甲, 乙) => fs.statSync(path.join(目录, 乙)).mtimeMs - fs.statSync(path.join(目录, 甲)).mtimeMs)
    } catch {
      return null
    }
    for (const 名 of 名们) {
      const 相对 = 计划.计划表 + "/" + 名
      const 行们 = fs.readFileSync(path.join(目录, 名), "utf8").split(/\r?\n/)
      const 表头行 = 行们.findIndex((行) => 行.trim().startsWith("|") && 行.includes("动作") && 行.includes("执行结果"))
      if (表头行 < 0) continue
      const 拆 = (行: string) => 行.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((格) => 格.trim())
      const 列 = 拆(行们[表头行])
      const 序列 = 列.findIndex((项) => 项.includes("序号"))
      const 动列 = 列.findIndex((项) => 项.includes("动作"))
      const 文列 = 列.findIndex((项) => 项.includes("目标文件"))
      const 说列 = 列.findIndex((项) => 项.includes("说明"))
      const 结列 = 列.findIndex((项) => 项.includes("执行结果"))
      const 步骤们: Array<{ 行号: number; 序号: number; 动作: string; 目标文件: string; 说明: string }> = []
      for (let 行号 = 表头行 + 2; 行号 < 行们.length; 行号++) {
        if (!行们[行号].trim().startsWith("|")) break
        const 格 = 拆(行们[行号])
        if ((格[结列] ?? "").trim() !== "") continue
        步骤们.push({ 行号, 序号: Number(格[序列] ?? 0), 动作: (格[动列] ?? "").trim(), 目标文件: (格[文列] ?? "").trim(), 说明: (格[说列] ?? "").trim() })
      }
      if (步骤们.length > 0) return { 相对, 行们, 步骤们 }
    }
    return null
  }

  /** 计划里的一步 → 一次工具调用；翻不出来的返回 null（这一格写「跳过」）。 */
  function 步到调用(步: { 动作: string; 目标文件: string; 说明: string }, 章节号: number) {
    const 定义 = 按名找(步.动作)
    if (!定义) return null
    const 章 = Number((/\d+/.exec(步.目标文件) ?? /\d+/.exec(步.说明) ?? [])[0]) || 章节号
    switch (定义.名称) {
      case "continue_writing":
        return { 名称: 定义.名称, 参数: { 章节号: 章, 指令: 步.说明 || "接着往下写" } }
      case "sync_ledger":
        return { 名称: 定义.名称, 参数: { 章节号: 章 } }
      case "dispatch_cluster":
        return { 名称: 定义.名称, 参数: { 任务: 步.说明 || "看看这一章接下来怎么写", 章节号: 章 } }
      case "read_file":
        return { 名称: 定义.名称, 参数: { 路径: 步.目标文件 || "书卷.yaml" } }
      case "query_ledger":
        return { 名称: 定义.名称, 参数: { 台账: 步.目标文件, 关键词: 步.说明 } }
      case "query_setting":
        return { 名称: 定义.名称, 参数: { 名: 步.说明 || 步.目标文件 } }
      case "query_foreshadow":
        return { 名称: 定义.名称, 参数: { 只看: 步.说明 || "待兑现" } }
      case "query_knowledge":
        return { 名称: 定义.名称, 参数: {} }
      default:
        return null
    }
  }

  /** 计划执行：只由代码驱动。逐条跑 → 回填执行结果列 → 提交 → 回一句总结。 */
  async function 执行计划(
    计划项: NonNullable<ReturnType<typeof 找待执行计划>>,
    回调: (类型: "思考" | "正文" | "用量" | "工具" | "提问" | "计划", 文本: string) => void,
  ): Promise<string> {
    const 环境 = 造工具环境("确认")
    const 最新 = 状态.项目?.统计.最新章节 ?? 0
    const 结果行们: string[] = []
    回调("计划", JSON.stringify({ 动作: "开始执行", 文件: 计划项.相对, 步骤: 计划项.步骤们.length }))
    for (const 步 of 计划项.步骤们) {
      const 调用 = 步到调用(步, 最新)
      let 结果文案 = ""
      if (!调用) {
        结果文案 = "跳过：不支持的步骤类型「" + 步.动作 + "」"
      } else {
        const 执行 = await 跑工具(调用.名称, 调用.参数, 环境, 1)
        回调("工具", JSON.stringify(执行.回执))
        结果文案 = 执行.需要确认 ? "未执行：需要作者确认" : 执行.回执.状态 === "完成" ? "成功：" + (执行.回执.摘要 ?? "已完成") : "失败：" + (执行.回执.摘要 ?? "未知原因")
      }
      结果行们.push(步.序号 + ". " + 步.动作 + " → " + 结果文案)
      const 格们 = 计划项.行们[步.行号].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((格) => 格.trim())
      格们[格们.length - 1] = 结果文案.replace(/\|/g, "／")
      计划项.行们[步.行号] = "| " + 格们.join(" | ") + " |"
    }
    if (状态.项目) {
      await 原子写文本(path.join(状态.项目.路径, 计划项.相对), 计划项.行们.join("\n"))
      await 提交(状态.项目.路径, "执行计划：" + path.basename(计划项.相对, ".md"), [计划项.相对])
    }
    回调("计划", JSON.stringify({ 动作: "执行完毕", 文件: 计划项.相对 }))
    return "计划已执行完（" + 计划项.步骤们.length + " 步），结果已写回 " + 计划项.相对 + "：\n" + 结果行们.join("\n")
  }

  /** 十个工具的实现全部在这里接线：工具模块只负责校验、确认、回灌格式。 */
  function 造工具环境(用户输入: string): 工具环境 {
    return {
      用户输入,
      续写: 续写给工具,
      改写: 改写给工具,
      同步台账: async (章节号) => {
        const 结果 = await 处理[通道.台账同步](章节号)
        return { 成功: Boolean(结果?.成功), 说明: String(结果?.说明 ?? "") }
      },
      派活: async (任务, 章节号) => {
        const 结果 = await 派活流(任务, 章节号)
        return { 汇总: String(结果?.汇总 ?? ""), 各自: Array.isArray(结果?.各自) ? 结果.各自 : [] }
      },
      读文件: async (相对路径, 上限) => {
        const 文件 = await 处理[通道.书库读文件](相对路径)
        const 文本 = String(文件?.文本 ?? "")
        return {
          文本: 上限 > 0 && 文本.length > 上限 ? 文本.slice(0, 上限) + "\n…（截到 " + 上限 + " 字）" : 文本,
          是文本: Boolean(文件?.是文本),
        }
      },
      查台账: async (台账, 关键词) => {
        if (!状态.项目) return { 文本: "尚未打开书库。", 行数: 0 }
        const 筛 = String(关键词 ?? "").trim()
        const 段: string[] = []
        let 行数 = 0
        for (const 册 of 投影台账(状态.项目.路径, 台账)) {
          for (const 表 of 册.表) {
            for (const 行 of 表.行) {
              const 文本 = Object.entries(行)
                .filter(([, 值]) => 值 !== "")
                .map(([列, 值]) => 列 + "：" + 值)
                .join("；")
              if (!文本) continue
              if (筛 && !文本.includes(筛)) continue
              行数++
              if (段.length < 60) 段.push("[" + 册.类型 + "｜" + (表.标题 || "表") + "] " + 文本)
            }
          }
        }
        return { 文本: 段.length > 0 ? 段.join("\n") : "（没有匹配的行）", 行数 }
      },
      查设定: async (名) => {
        if (!状态.项目) return { 文本: "尚未打开书库。", 找到: false }
        const 卡 = 投影设定(状态.项目.路径, 名)
        if (!卡) return { 文本: "没有找到叫「" + 名 + "」的设定卡。", 找到: false }
        const 字段 = Object.entries(卡.字段)
          .map(([键, 值]) => 键 + "：" + (Array.isArray(值) ? 值.join("、") : String(值)))
          .join("\n")
        return { 文本: "《" + 卡.名 + "》（" + 卡.路径 + "）\n" + 字段 + "\n\n" + 卡.正文开头, 找到: true }
      },
      查伏笔: async (只看) => {
        if (!状态.项目) return "尚未打开书库。"
        const 全 = 投影伏笔(状态.项目.路径, 状态.项目.统计.最新章节)
        const 筛 = String(只看 ?? "").trim()
        const 选 =
          筛 === "已兑现" ? 全.filter((项) => 项.状态 === "已兑现")
            : 筛 === "超期" ? 全.filter((项) => 项.超期)
              : 筛 === "久置" ? 全.filter((项) => 项.久置)
                : 筛 === "全部" ? 全
                  : 全.filter((项) => 项.状态 === "待兑现")
        const 行们 = 选
          .slice(0, 80)
          .map((项) => 项.编号 + " " + 项.名称 + "｜" + 项.状态 + "｜埋 ch" + (项.埋章 ?? "—") + "｜搁置 " + 项.搁置章数 + "｜间隔 " + (项.参考间隔 ?? "—") + (项.超期 ? "｜超期" : 项.久置 ? "｜久置" : ""))
        return "共 " + 选.length + " 条（全书 " + 全.length + " 条）：\n" + 行们.join("\n")
      },
      建计划: 落计划表,
      派子智能体: async (成员或角色, 任务) => {
        if (!状态.项目) return "尚未打开书库。"
        const 成员们 = await 取集群()
        const 命中 =
          成员们.find((项) => 项.名称 === 成员或角色 || 项.角色 === 成员或角色) ??
          成员们.find((项) => 项.名称.includes(成员或角色) || 项.角色.includes(成员或角色))
        if (!命中) return "集群里没有「" + 成员或角色 + "」。可用：" + 成员们.map((项) => 项.名称 + "(" + 项.角色 + ")").join("、")
        const 设置 = 读设置(数据目录)
        const 结果 = await 执行成员({
          根目录: 状态.项目.路径,
          数据目录,
          成员: 命中,
          任务,
          关键词: 任务.split(/[，。、\s]+/).filter(Boolean).slice(0, 12),
          基址: 设置.模型.网关地址,
          密钥: 设置.模型.API密钥,
          模型: 设置.模型.分工.助手,
          策略: 取调用策略(设置.模型),
          单卡注入字数: 设置.上下文.单卡注入字数,
          技能: 设置.智能体.技能,
          章节号: 状态.项目.统计.最新章节,
        })
        return "【" + 结果.成员 + "｜" + 结果.角色 + "】" + (结果.成功 ? "" : "（失败）") + "\n" + 结果.产出
      },
      查知情: async (秘密, 人, 截至章) => {
        if (!状态.项目) return "尚未打开书库。"
        const 截 = 截至章 && 截至章 > 0 ? 截至章 : undefined
        const 投影 = 投影知情(状态.项目.路径, 截)
        const 秘筛 = String(秘密 ?? "").trim()
        const 人筛 = String(人 ?? "").trim()
        const 选中 = 投影.秘密.filter((项) => !秘筛 || 项.名称.includes(秘筛))
        const 段: string[] = [投影.说明]
        for (const 项 of 选中) {
          const 知情 = 项.知情.filter((条) => !人筛 || 条.人.includes(人筛))
          if (人筛 && 知情.length === 0) continue
          段.push(
            "【" + 项.名称 + "】",
            "  知情：" + (知情.length > 0 ? 知情.map((条) => 条.人 + (条.何时知道 ? "（ch" + 条.何时知道 + "）" : "") + (条.依据 ? "｜" + 条.依据 : "")).join("；") : "（无）"),
            "  不知情：" + (项.不知情.length > 0 ? 项.不知情.slice(0, 12).join("、") : "（都知道了）"),
          )
        }
        if (选中.length === 0 && 投影.候选.length > 0) {
          段.push("", "可补成知情台账的候选（来自禁揭清单，只是提示）：")
          for (const 项 of 投影.候选.slice(0, 8)) 段.push("  · " + 项.名称 + (项.可能涉及.length ? "（可能涉及：" + 项.可能涉及.join("、") + "）" : ""))
        }
        return 段.join("\n")
      },
      写章节: async (章节号, 正文) => {
        const 结果 = await 处理[通道.保存章节](章节号, 正文)
        return { 成功: Boolean(结果?.成功), 说明: String(结果?.说明 ?? "") }
      },
    }
  }

  /**
   * 对话主循环：最多 4 轮工具调用。
   * 真 tool_calls 优先；网关不支持 tools（或模型不会用）时退化成解析约定 JSON 块。
   * 写盘工具在「工具执行」里挡着，没得到确认就停下等作者回一句「确认」。
   */
  async function 流式(
    请求: 对话请求,
    回调: (类型: "思考" | "正文" | "用量" | "工具" | "提问" | "计划", 文本: string) => void,
    信号?: AbortSignal,
  ): Promise<string> {
    const 设置 = 读设置(数据目录)
    const 模式 = 请求.模式 ?? "对话"
    const 模式词 =
      模式 === "讨论"
        ? "【本轮是讨论】只读：不要写任何文件、不要改正文、不要提交；把不同意见摆出来，最后给结论。"
        : 模式 === "计划"
          ? "【本轮是计划】优先用「建计划」把要做的事写成计划表（每步一行），先别动正文与台账；写完告诉作者计划表在哪、等他确认。"
          : ""
    const 基础系统 = 请求.系统提示 || 组装系统提示({
      书名: 状态.项目?.书名 ?? "未命名作品",
      章节号: 0,
      章节标题: "创作讨论",
      伏笔: 状态.看板?.伏笔 ?? [],
      正文尾部: "",
    })
    const 系统 = [
      基础系统,
      模式词,
      "",
      "【可用工具】续写 / 改写 / 同步台账 / 派活 / 读文件 / 写章节 / 查台账 / 查设定 / 查伏笔 / 查知情 / 建计划 / 问用户 / 派子智能体。查事实优先用结构化查询，别自己用正则抠表格。要干活就直接调用工具，绝不假装已经做过。",
      "如果你的接口不支持工具调用，就单独输出一段 json 代码块，形如：",
      '```json',
      '{"工具":"续写","参数":{"章节号":27,"指令":"写得冷一点","字数上限":300}}',
      '```',
      "系统会执行它、把结果回给你，你再接着答。写盘类工具（同步台账 / 派活 / 写章节）必须先得到作者确认。",
    ].join("\n")

    const 消息: 对话消息[] = [
      { role: "system", content: 系统 },
      { role: "user", content: 请求.用户输入 },
    ]
    const 环境 = 造工具环境(请求.用户输入)
    const 控制器 = new AbortController()
    进行中.set(请求.请求号, 控制器)
    const 用信号 = 信号 ?? 控制器.signal
    let 最终 = ""

    try {
      // 计划模式 + 作者说了确认词 + 有未执行的计划 → 直接按步骤跑（不交给模型）
      if (模式 === "计划" && 已确认(请求.用户输入)) {
        const 计划项 = 找待执行计划()
        if (计划项) return await 执行计划(计划项, 回调)
      }

      for (let 轮 = 1; 轮 <= 4; 轮++) {
        const 结果 = await 流式对话带工具({
          ...取调用策略(设置.模型),
          基址: 设置.模型.网关地址,
          密钥: 设置.模型.API密钥,
          模型: 请求.模型,
          消息,
          工具: 轮 < 4 ? 工具声明们(模式, 设置.智能体.只读工具) : undefined,
          温度: 请求.温度 ?? 设置.模型.温度,
          信号: 用信号,
          回调,
        })
        最终 = 结果.文本

        const 真调用 = 结果.工具调用.length > 0
        const 调用们: Array<{ id?: string; 名称: string; 参数: unknown }> = 真调用
          ? 结果.工具调用.map((项) => ({ id: 项.id, 名称: 项.名称, 参数: 项.参数 }))
          : 解析约定块(结果.文本)
        if (调用们.length === 0) return 最终

        消息.push({
          role: "assistant",
          content: 结果.文本,
          ...(真调用
            ? {
                tool_calls: 结果.工具调用.map((项) => ({
                  id: 项.id,
                  type: "function" as const,
                  function: { name: 项.名称, arguments: 项.参数 },
                })),
              }
            : {}),
        })

        for (const 调用 of 调用们) {
          const 执行 = await 跑工具(调用.名称, 调用.参数, 环境, 轮)
          回调("工具", JSON.stringify(执行.回执))
          // 「问用户」：推一条提问事件，本轮就结束，等作者回答
          if (执行.提问题) {
            回调("提问", JSON.stringify(执行.提问题))
            return 执行.提问题.问题
          }
          if (执行.需要确认) return 执行.回灌
          if (真调用) 消息.push({ role: "tool", tool_call_id: 调用.id ?? "", content: 执行.回灌 })
          else 消息.push({ role: "user", content: "（工具结果）\n" + 执行.回灌 })
        }
      }
      return 最终 || "工具连了 4 轮还没收口，先停下：直接告诉我下一步怎么走。"
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