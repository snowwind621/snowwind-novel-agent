// 只负责一件事：设置弹窗——左边分组导航、右边滚动内容、底部固定操作条。
import React, { useEffect, useState } from "react"
import { 桥 } from "./接口"
import type { 设置, 外观设置, 编辑器设置, 模型设置, 上下文设置, 智能体设置, 台账设置, 书库设置, 技能项, 集群成员 } from "./接口"
import { 取默认设置 } from "../14 配置密钥/默认设置"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"
import { 外观分组 } from "./设置/外观分组"
import { 编辑器分组 } from "./设置/编辑器分组"
import { 模型分组 } from "./设置/模型分组"
import { 上下文分组 } from "./设置/上下文分组"
import { 智能体分组 } from "./设置/智能体分组"
import { 台账分组 } from "./设置/台账分组"
import { 书库分组 } from "./设置/书库分组"

type 分组名 = "外观" | "编辑器" | "模型" | "上下文" | "智能体" | "台账" | "书库"

const 分组们: Array<{ 名: 分组名; 图标: 图标名; 说明: string }> = [
  { 名: "外观", 图标: "调色板", 说明: "主题、字号、正文排版、圆角与动效" },
  { 名: "编辑器", 图标: "笔", 说明: "自动保存、Git 提交、撤回栈" },
  { 名: "模型", 图标: "芯片", 说明: "网关、分工、请求与采样" },
  { 名: "上下文", 图标: "层", 说明: "注入、历史、摘要" },
  { 名: "智能体", 图标: "用户群", 说明: "集群、讨论、计划、人格、技能" },
  { 名: "台账", 图标: "列表", 说明: "自动同步、静置秒、失败重试" },
  { 名: "书库", 图标: "书本", 说明: "当前书库、校验、导出" },
]

export function 设置面板(属性: {
  设定: 设置
  关闭: () => void
  存好: (新设定: 设置) => void
  成员们: 集群成员[]
  派活中: boolean
  章节号: number | null
  派活: (任务: string) => void
  新建成员: (名称: string, 职责: string, 管辖: string) => void
  删除成员: (id: string) => void
  改成员: (id: string, 名称: string, 职责: string, 管辖: string) => void
  待裁定数: number
  看待裁定: () => void
}) {
  const [分组, set分组] = useState<分组名>("外观")
  const [草稿, set草稿] = useState<设置>(属性.设定)
  const [清单, set清单] = useState<string[]>([])
  const [提示, set提示] = useState("")
  const [迁移提示, set迁移提示] = useState("")

  // 外观里跟观感有关的三项即时生效：只改 CSS 变量，不动别人的代码。
  useEffect(() => {
    const 根 = document.documentElement
    根.style.setProperty("--卡圆角", 草稿.外观.圆角 + "px")
    根.style.setProperty("--正文行宽", 草稿.外观.行宽 === "窄" ? "620px" : 草稿.外观.行宽 === "宽" ? "980px" : "780px")
    if (草稿.外观.减少动态) 根.dataset.减少动态 = "是"
    else delete 根.dataset.减少动态
  }, [草稿.外观.圆角, 草稿.外观.行宽, 草稿.外观.减少动态])

  const 改外观 = (补丁: Partial<外观设置>) => set草稿({ ...草稿, 外观: { ...草稿.外观, ...补丁 } })
  const 改编辑器 = (补丁: Partial<编辑器设置>) => set草稿({ ...草稿, 编辑器: { ...草稿.编辑器, ...补丁 } })
  const 改模型 = (补丁: Partial<模型设置>) => set草稿({ ...草稿, 模型: { ...草稿.模型, ...补丁 } })
  const 改上下文 = (补丁: Partial<上下文设置>) => set草稿({ ...草稿, 上下文: { ...草稿.上下文, ...补丁 } })
  const 改智能体 = (补丁: Partial<智能体设置>) => set草稿({ ...草稿, 智能体: { ...草稿.智能体, ...补丁 } })
  const 改台账 = (补丁: Partial<台账设置>) => set草稿({ ...草稿, 台账: { ...草稿.台账, ...补丁 } })
  const 改书库 = (补丁: Partial<书库设置>) => set草稿({ ...草稿, 书库: { ...草稿.书库, ...补丁 } })
  const 改分工 = (键: keyof 模型设置["分工"], 值: string) =>
    set草稿({ ...草稿, 模型: { ...草稿.模型, 分工: { ...草稿.模型.分工, [键]: 值 } } })
  const 改人格 = (键: keyof 智能体设置["人格"], 值: string) =>
    set草稿({ ...草稿, 智能体: { ...草稿.智能体, 人格: { ...草稿.智能体.人格, [键]: 值 } } })
  const 改技能 = (序: number, 补丁: Partial<技能项>) => {
    const 新 = 草稿.智能体.技能.map((项, 位) => (位 === 序 ? { ...项, ...补丁 } : 项))
    改智能体({ 技能: 新 })
  }
  const 加技能 = () => 改智能体({ 技能: [...草稿.智能体.技能, { 名称: "", 内容: "", 默认附加: false }] })
  const 删技能 = (序: number) => 改智能体({ 技能: 草稿.智能体.技能.filter((_, 位) => 位 !== 序) })

  const 导入旧书库 = async () => {
    const 是外壳 = Boolean((window as any).桥)
    const 旧根 = 是外壳 ? "" : window.prompt("旧书库根目录（含 project.yaml 的那一层）") ?? ""
    const 新根 = 是外壳 ? "" : window.prompt("新书库目录（必须是一个空目录）") ?? ""
    if (!是外壳 && (!旧根.trim() || !新根.trim())) return
    set迁移提示("正在转换…")
    try {
      const 结果 = await 桥.导入旧书库(旧根, 新根)
      set迁移提示(结果.说明)
    } catch (错误: any) {
      set迁移提示("导入失败：" + String(错误?.message ?? 错误))
    }
  }

  const 拉模型 = async () => {
    set提示("正在拉取…")
    const 结果 = await 桥.模型清单()
    if (Array.isArray(结果)) {
      set清单(结果)
      set提示("共 " + 结果.length + " 个模型")
    } else {
      set提示("失败：" + 结果.错误)
    }
  }

  const 有改动 = JSON.stringify(草稿) !== JSON.stringify(属性.设定)
  const [存中, set存中] = useState(false)

  /** 应用 = 立刻写盘并生效，但不关弹窗；保存 = 写盘并关闭。 */
  const 写盘 = async (): Promise<boolean> => {
    set存中(true)
    try {
      const 已存 = await 桥.保存设置(草稿)
      属性.存好(已存)
      return true
    } catch {
      return false
    } finally {
      set存中(false)
    }
  }

  const 应用 = async () => {
    await 写盘()
  }

  const 存 = async () => {
    if (await 写盘()) 属性.关闭()
  }

  const 恢复默认 = () => {
    if (!window.confirm("除「上次打开的书库」外，全部设置回到默认值？")) return
    const 默认 = 取默认设置()
    set草稿({ ...默认, 书库: { ...默认.书库, 上次路径: 草稿.书库.上次路径 } })
  }

  const 画分组 = () => {
    if (分组 === "外观") return <外观分组 外观={草稿.外观} 改={改外观} />
    if (分组 === "编辑器") return <编辑器分组 编辑器={草稿.编辑器} 改={改编辑器} />
    if (分组 === "模型")
      return <模型分组 模型={草稿.模型} 改={改模型} 改分工={改分工} 清单={清单} 拉模型={拉模型} 提示={提示} />
    if (分组 === "上下文")
      return <上下文分组 上下文={草稿.上下文} 改={改上下文} 分工模型们={Array.from(new Set(Object.values(草稿.模型.分工)))} />
    if (分组 === "智能体")
      return (
        <智能体分组
          智能体={草稿.智能体}
          改={改智能体}
          改人格={改人格}
          改技能={改技能}
          加技能={加技能}
          删技能={删技能}
          成员们={属性.成员们}
          章节号={属性.章节号}
          派活中={属性.派活中}
          派活={属性.派活}
          新建成员={属性.新建成员}
          删除成员={属性.删除成员}
          改成员={属性.改成员}
          待裁定数={属性.待裁定数}
          看待裁定={属性.看待裁定}
        />
      )
    if (分组 === "台账") return <台账分组 台账={草稿.台账} 改={改台账} />
    return <书库分组 书库={草稿.书库} 改={改书库} 迁移提示={迁移提示} 导入旧书库={导入旧书库} />
  }

  return (
    <div className="遮罩" onClick={属性.关闭}>
      <div className="设置框" onClick={(事件) => 事件.stopPropagation()}>
        <div className="设置头">
          <h2>设置</h2>
          <div className="微信息">密钥只存在本机，不会写进书库目录。</div>
        </div>

        <div className="设置主体">
          <nav className="设置导航">
            {分组们.map((项) => (
              <button
                key={项.名}
                className={"设置导航项" + (分组 === 项.名 ? " 选中" : "")}
                onClick={() => set分组(项.名)}
                title={项.说明}
              >
                <图标 名={项.图标} 大小={15} />
                <span>{项.名}</span>
              </button>
            ))}
          </nav>
          <div className="设置内容">{画分组()}</div>
        </div>

        <div className="底部行">
          <button className="恢复默认" onClick={恢复默认}>
            恢复默认
          </button>
          <span className={"改动提示" + (有改动 ? " 有" : "")}>{有改动 ? "有改动，记得应用或保存" : "没有改动"}</span>
          <button onClick={属性.关闭} title="丢弃这次改动">取消</button>
          <button onClick={() => void 应用()} disabled={!有改动 || 存中} title="写盘并生效，但不关这个窗口">
            {存中 ? "写入中…" : "应用"}
          </button>
          <button onClick={() => void 存()} disabled={!有改动 || 存中} title="写盘并关闭窗口">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
