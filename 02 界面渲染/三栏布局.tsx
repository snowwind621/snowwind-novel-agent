// 只负责一件事：拼起三栏，持有全局状态（当前章、看板、集群、对话）。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 千字, 时刻, 应用外观, 解析主题, 盯系统主题, 默认设置, 补齐设置 } from "./接口"
import type { 项目摘要, 看板数据, 设置, 外观设置, 集群成员, 对话条目, 书架项, 文件内容, 待裁定章 } from "./接口"
import { 左栏 } from "./左栏"
import type { 左页 } from "./左栏"
import { 正文编辑 } from "./正文编辑"
import { 文件视图 } from "./文件视图"
import { AI面板 } from "./AI面板"
import { 设置面板 } from "./设置面板"
import { 视觉总览 } from "./视觉总览"
import { 图标 } from "./图标"

function 读宽度(键: string, 默认: number, 下限: number, 上限: number): number {
  const 存 = Number(localStorage.getItem(键))
  return Number.isFinite(存) && 存 >= 下限 && 存 <= 上限 ? Math.round(存) : 默认
}

function 夹住(值: number, 下限: number, 上限: number): number {
  return Math.min(上限, Math.max(下限, 值))
}

/** 链接里带 ?页=文件 就落到那一页，方便深链与截图。 */
function 初页(): 左页 {
  const 链接页 = new URLSearchParams(location.search).get("页")
  return 链接页 === "文件" || 链接页 === "台账" || 链接页 === "建议" ? 链接页 : "章节"
}

/** 看板通道顺带带回全书待裁定（见 01 应用外壳/请求处理.ts），这里只挑出来，读不到就当空。 */
function 取待裁定(看板: unknown): 待裁定章[] {
  const 值 = (看板 as { 待裁定?: 待裁定章[] } | null)?.待裁定
  return Array.isArray(值) ? 值 : []
}

export function 三栏布局() {
  const [项目, set项目] = useState<项目摘要 | null>(null)
  const [看板, set看板] = useState<看板数据 | null>(null)
  const [章节号, set章节号] = useState<number | null>(null)
  const [正文, set正文] = useState("")
  const [标题, set标题] = useState("")
  const [脏, set脏] = useState(false)
  const [状态字, set状态字] = useState("")
  const [设定, set设定] = useState<设置 | null>(null)
  const [显示设置, set显示设置] = useState(false)
  const [实主题, set实主题] = useState<string>(document.documentElement.dataset.主题 ?? "暗")
  const [成员们, set成员们] = useState<集群成员[]>([])
  const [派活中, set派活中] = useState(false)
  const [显示导出, set显示导出] = useState(false)
  const [书架, set书架] = useState<书架项[]>([])
  const [显示书架, set显示书架] = useState(false)
  const [文件, set文件] = useState<文件内容 | null>(null)
  /** 中栏视图级别：正文编辑 / 全书视图（存本地，重开保持） */
  const [中栏视图, set中栏视图] = useState<"编辑" | "全书">(() => {
    // 深链 ?视图=全书 只影响这一次打开，不改用户存下来的偏好
    if (new URLSearchParams(location.search).get("视图") === "全书") return "全书"
    return localStorage.getItem("中栏视图") === "全书" ? "全书" : "编辑"
  })
  const [待裁定, set待裁定] = useState<待裁定章[]>([])
  const [左页, set左页] = useState<左页>(初页)
  const [左宽, set左宽] = useState(() => 读宽度("左栏宽", 300, 220, 460))
  const [右宽, set右宽] = useState(() => 读宽度("右栏宽", 420, 320, 640))
  const [拖侧, set拖侧] = useState<"左" | "右" | null>(null)
  const [台账同步中, set台账同步中] = useState(false)
  const 拖拽 = useRef<{ 侧: "左" | "右"; 起X: number; 起宽: number } | null>(null)
  const 派活占位 = useRef("")
  const [消息们, set消息们] = useState<对话条目[]>(() => {
    try {
      const 存过 = localStorage.getItem("对话")
      return 存过 ? (JSON.parse(存过) as 对话条目[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem("对话", JSON.stringify(消息们.slice(-200)))
    } catch {
      /* 存不下就算了，不影响写作 */
    }
  }, [消息们])


  useEffect(() => {
    const 卸载 = 桥.监听派活((事件) => {
      const id = 派活占位.current
      if (!id) return
      const 行 = "正在召集负责人… " + 事件.完成数 + "/" + 事件.总数 + "　" + (事件.阶段 === "完成" ? "✓ " : "… ") + 事件.成员
      set消息们((旧) => 旧.map((条) => (条.id === id ? { ...条, 文本: 行 } : 条)))
    })
    return 卸载
  }, [])

  /** 外观一变就套上去：data-* + CSS 变量 + 本地缓存。 */
  const 套用外观 = (外观: 外观设置) => {
    应用外观(外观)
    set实主题(解析主题(外观.主题))
  }

  /** 顶栏日/夜按钮：等价于改设置里的主题，两处永远同一份状态。 */
  const 切主题 = () => {
    const 当前 = 设定?.外观.主题 ?? "暗"
    const 新主题: 外观设置["主题"] = 解析主题(当前) === "暗" ? "亮" : "暗"
    if (!设定) {
      const 兜底: 外观设置 = { ...默认设置.外观, 主题: 新主题 }
      套用外观(兜底)
      return
    }
    const 新设定: 设置 = { ...设定, 外观: { ...设定.外观, 主题: 新主题 } }
    套用外观(新设定.外观)
    set设定(新设定)
    void 桥.保存设置(新设定).then((存) => {
      set设定(存)
      套用外观(存.外观)
    })
  }

  // 跟随系统：系统换深浅色时重刷一次
  useEffect(() => {
    if (!设定 || 设定.外观.主题 !== "跟随系统") return
    return 盯系统主题(() => 套用外观(设定.外观))
  }, [设定?.外观.主题, 设定?.外观.界面字号])

  useEffect(() => {
    try {
      localStorage.setItem("中栏视图", 中栏视图)
    } catch {
      /* 存不下不影响本回合 */
    }
  }, [中栏视图])

  // 宽度落 localStorage：重开保持上次拖到的位置。
  useEffect(() => {
    localStorage.setItem("左栏宽", String(左宽))
  }, [左宽])

  useEffect(() => {
    localStorage.setItem("右栏宽", String(右宽))
  }, [右宽])

  // 拖拽只挂一次 window 监听：按下时记起点，移动时按差值改宽度，松开就收工。
  useEffect(() => {
    const 移动 = (事件: PointerEvent) => {
      const 记 = 拖拽.current
      if (!记) return
      // 界面缩放会把鼠标位移放大：除回去，拖到的位置才跟手
      const 缩放 = Number(getComputedStyle(document.documentElement).zoom) || 1
      const 差 = (事件.clientX - 记.起X) / 缩放
      if (记.侧 === "左") set左宽(夹住(记.起宽 + 差, 220, 460))
      else set右宽(夹住(记.起宽 - 差, 320, 640))
    }
    const 松开 = () => {
      if (!拖拽.current) return
      拖拽.current = null
      set拖侧(null)
      document.body.classList.remove("拖宽中")
    }
    window.addEventListener("pointermove", 移动)
    window.addEventListener("pointerup", 松开)
    return () => {
      window.removeEventListener("pointermove", 移动)
      window.removeEventListener("pointerup", 松开)
    }
  }, [])

  const 起拖 = (侧: "左" | "右") => (事件: React.PointerEvent<HTMLDivElement>) => {
    事件.preventDefault()
    拖拽.current = { 侧, 起X: 事件.clientX, 起宽: 侧 === "左" ? 左宽 : 右宽 }
    set拖侧(侧)
    document.body.classList.add("拖宽中")
  }

  // 待裁定每次现读（很小），换书、换章、派活起落都要重看一遍。
  useEffect(() => {
    let 还有效 = true
    void (async () => {
      try {
        const 数据 = await 桥.读取看板()
        if (还有效) set待裁定(取待裁定(数据))
      } catch {
        if (还有效) set待裁定([])
      }
    })()
    return () => {
      还有效 = false
    }
  }, [项目?.路径, 章节号, 派活中])

  // 每条消息自动盖章时间；历史留 200 条上限，别把 localStorage 撑爆。
  const 追加 = (条: 对话条目) => set消息们((旧) => [...旧, { 时间: Date.now(), ...条 }].slice(-200))
  const 改条 = (id: string, 补: string) =>
    set消息们((旧) => 旧.map((条) => (条.id === id ? { ...条, 文本: 条.文本 + 补 } : 条)))
  const 补条 = (id: string, 补丁: Partial<对话条目>) =>
    set消息们((旧) => 旧.map((条) => (条.id === id ? { ...条, ...补丁 } : 条)))

  useEffect(() => {
    void (async () => {
      const 已存设置 = 补齐设置(await 桥.读取设置())
      // 深链 ?主题=亮 只压过这一次显示，不写回设置
      const 链接主题 = new URLSearchParams(location.search).get("主题")
      const 生效设置: 设置 =
        链接主题 === "亮" || 链接主题 === "暗"
          ? { ...已存设置, 外观: { ...已存设置.外观, 主题: 链接主题 } }
          : 已存设置
      set设定(生效设置)
      应用外观(生效设置.外观, 链接主题 !== "亮" && 链接主题 !== "暗")
      set实主题(解析主题(生效设置.外观.主题))
      set书架(await 桥.书架())
      const 已开 = await 桥.当前项目()
      if (已开) {
        set项目(已开)
        set看板(await 桥.读取看板())
        set成员们(await 桥.集群成员())
        const 首章 = 已开.卷[0]?.章节[0]?.编号 ?? null
        const 末章 = 已开.统计.最新章节 || 首章
        if (末章) {
          const 读 = await 桥.读取章节(末章)
          set章节号(读.编号)
          set标题(读.标题)
          set正文(读.正文)
        }
      }
    })()
  }, [])

  const 装载进界面 = async (结果: 项目摘要) => {
    set项目(结果)
    set看板(await 桥.读取看板())
    set成员们(await 桥.集群成员())
    set脏(false)
    set书架(await 桥.书架())
    const 末章 = 结果.统计.最新章节 || 结果.卷[0]?.章节[0]?.编号 || 0
    if (末章) {
      const 读 = await 桥.读取章节(末章)
      set章节号(读.编号)
      set标题(读.标题)
      set正文(读.正文)
    }
  }

  const 打开书库 = async () => {
    const 是外壳 = Boolean((window as any).桥)
    const 路径 = 是外壳 ? "" : window.prompt("输入书库根目录（含 书卷.yaml 的那一层）", 项目?.路径 ?? "") ?? ""
    if (!是外壳 && !路径.trim()) return
    const 结果 = await 桥.打开项目(路径)
    if (!结果) return
    await 装载进界面(结果)
  }

  const 打开指定 = async (路径: string) => {
    try {
      const 结果 = await 桥.打开项目(路径)
      if (结果) await 装载进界面(结果)
    } catch (错误: any) {
      set状态字("打不开这本书：" + String(错误?.message ?? 错误))
    }
  }

  const 选章 = async (编号: number): Promise<boolean> => {
    if (脏 && !window.confirm("当前章节有未保存的修改，仍要切换吗？")) return false
    const 读 = await 桥.读取章节(编号)
    set章节号(读.编号)
    set标题(读.标题)
    set正文(读.正文)
    set脏(false)
    set状态字("")
    set文件(null)
    set中栏视图("编辑")
    return true
  }

  /** 书库树里点一个文件：是某章正文就切回章节视图，其余进文件视图。 */
  const 打开文件 = async (相对路径: string) => {
    for (const 卷 of 项目?.卷 ?? []) {
      const 章 = 卷.章节.find((项) => 项.文件 === 相对路径)
      if (!章) continue
      if (!(await 选章(章.编号))) return
      set文件(null)
      return
    }
    try {
      set文件(await 桥.书库读文件(相对路径))
      set状态字("")
    } catch (错误: any) {
      set状态字("打不开文件：" + String(错误?.message ?? 错误))
    }
  }

  /** 文件视图里保存：通道里已经做了原子写 + Git 提交 + 黑板事件。 */
  const 保存文件 = async (相对路径: string, 文本: string): Promise<string> => {
    const 结果 = await 桥.书库写文件(相对路径, 文本)
    set看板(await 桥.读取看板())
    return 结果.说明
  }

  /** 记到对话=true 是从对话栏点的，结果要变成一条系统消息；保存后的自动同步不刷屏。 */
  const 同步台账 = async (编号: number, 记到对话 = false) => {
    const 占位id = "台账-" + Date.now()
    set台账同步中(true)
    set状态字("台账同步中…")
    if (记到对话) 追加({ id: 占位id, 谁: "系统", 文本: "台账同步中…第 " + 编号 + " 章", 进行中: true })
    try {
      const 结果 = await 桥.台账同步(编号)
      set状态字(结果.说明)
      if (记到对话) {
        const 改动 = 结果.改动?.length ? "\n改动 " + 结果.改动.length + " 处：" + 结果.改动.slice(0, 8).join("、") : ""
        补条(占位id, { 文本: "台账同步：" + 结果.说明 + 改动, 进行中: false })
      }
      set看板(await 桥.读取看板())
    } catch (错误: any) {
      const 说明 = "台账同步失败：" + String(错误?.message ?? 错误)
      set状态字(说明)
      if (记到对话) 补条(占位id, { 文本: 说明, 进行中: false, 出错: true })
    } finally {
      set台账同步中(false)
    }
  }

  const 保存 = async () => {
    if (章节号 === null) return
    const 结果 = await 桥.保存章节(章节号, 正文)
    set状态字(结果.说明)
    if (结果.成功) {
      set脏(false)
      set看板(await 桥.读取看板())
      const 新项目 = await 桥.当前项目()
      if (新项目) set项目(新项目)
      await 同步台账(章节号)
    }
  }

  const 派活 = async (任务: string) => {
    if (派活中) return
    if (章节号 === null) {
      set状态字("先选一章，再派活")
      return
    }
    set派活中(true)
    const 占位 = "派-" + Date.now()
    派活占位.current = 占位
    追加({ id: 占位 + "-我", 谁: "你", 文本: "（派活）" + 任务 })
    追加({ id: 占位, 谁: "系统", 文本: "正在召集负责人…", 进行中: true })
    try {
      const 结果 = await 桥.派活(任务, 章节号)
      set消息们((旧) =>
        旧.map((条) =>
          条.id === 占位
            ? { ...条, 谁: "集群", 文本: 结果.汇总, 明细: 结果.各自, 进行中: false }
            : 条,
        ),
      )
    } catch (错误: any) {
      set消息们((旧) =>
        旧.map((条) => (条.id === 占位 ? { ...条, 文本: "派活失败：" + String(错误?.message ?? 错误), 进行中: false } : 条)),
      )
    } finally {
      派活占位.current = ""
      set派活中(false)
    }
  }

  const 删除成员 = async (id: string) => {

    set成员们(await 桥.删除成员(id))
    set状态字("已移除一位智能体")
  }

  const 改成员 = async (id: string, 名称: string, 职责: string, 管辖: string) => {
    set成员们(await 桥.改成员(id, 名称, 职责, 管辖))
    set状态字("已更新智能体：" + 名称)
  }

  const 新建成员 = async (名称: string, 职责: string, 管辖: string) => {
    const 全部 = await 桥.新建成员(名称, 职责, 管辖)
    set成员们(全部)
    set状态字("已新增智能体：" + 名称)
  }

  const 导出 = async (格式: string) => {
    set显示导出(false)
    set状态字("正在导出 " + 格式 + "…")
    try {
      const 结果 = await 桥.导出(格式)
      set状态字(结果.说明)
    } catch (错误: any) {
      set状态字("导出失败：" + String(错误?.message ?? 错误))
    }
  }

  const 清空对话 = () => {
    if (!window.confirm("清空全部对话记录？清掉就找不回来了。")) return
    set消息们([])
    try {
      localStorage.removeItem("对话")
    } catch {
      /* 清不掉也不影响写作 */
    }
  }

  /** 导出成 Markdown 落进书库 讨论/（走 书库/写文件，顺带 Git 提交）。 */
  const 导出对话 = async (): Promise<string> => {
    if (!项目) return "还没有打开书库"
    if (消息们.length === 0) return "还没有对话可导出"
    const 现在 = new Date()
    const 戳 = 现在.toISOString().slice(0, 16).replace(/[:T]/g, "-")
    const 行们 = ["# 对话记录 · " + 现在.toLocaleString("zh-CN"), "", "> 由右侧对话栏导出，仅供追溯，不作写作依据。", ""]
    for (const 条 of 消息们) {
      行们.push("## " + 条.谁 + " · " + (时刻(条.时间) || "—"), "", 条.文本.trim() || "（空）", "")
      for (const 项 of 条.明细 ?? []) 行们.push("- **" + 项.成员 + "**（" + 项.角色 + "）：" + 项.产出.replace(/\n+/g, " "), "")
    }
    const 结果 = await 桥.书库写文件("讨论/对话记录-" + 戳 + ".md", 行们.join("\n"))
    return 结果.说明
  }

  const 本章条目 = 待裁定.find((项) => 项.章号 === (章节号 ?? 0))?.条目 ?? []

  return (
    <div className="框架">
      <div className="顶栏">
        <span className="书名">{项目 ? 项目.书名 : "雪风小说工坊"}</span>
        {项目 ? (
          <span className="微信息">
            {项目.统计.章数} 章 · {千字(项目.统计.总字数)} · 最新 ch{项目.统计.最新章节} · 集群 {成员们.length} 人
          </span>
        ) : (
          <span className="微信息">尚未打开书库</span>
        )}
        <div className="顶栏右">
          <button onClick={切主题} title="切换明暗（等价于设置里的主题）">
            <图标 名={实主题 === "暗" ? "月亮" : "太阳"} />
            {实主题 === "暗" ? "夜间" : "日间"}
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => set显示导出((旧) => !旧)} title="导出整本书">
              <图标 名="下载" />
              导出
            </button>
            {显示导出 ? (
              <div className="菜单">
                {[
                  ["txt", "TXT 纯文本"],
                  ["md", "Markdown"],
                  ["docx", "Word（docx）"],
                  ["epub", "EPUB 电子书"],
                ].map(([键, 名]) => (
                  <div key={键} className="菜单项" onClick={() => 导出(键)}>
                    {名}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <button onClick={() => set显示设置(true)} title="打开设置">
            <图标 名="设置" />
            设置
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => set显示书架((旧) => !旧)} title="打开或切换书库">
              <图标 名="文件夹打开" />
              打开书库
              <图标 名="箭头下" 大小={14} />
            </button>
            {显示书架 ? (
              <div className="菜单" style={{ minWidth: 240 }}>
                {书架.length === 0 ? <div className="菜单项" style={{ color: "var(--字弱)" }}>还没有打开过书</div> : null}
                {书架.map((项) => (
                  <div
                    key={项.路径}
                    className="菜单项"
                    title={项.路径}
                    onClick={() => {
                      set显示书架(false)
                      void 打开指定(项.路径)
                    }}
                  >
                    {项.书名}
                  </div>
                ))}
                <div
                  className="菜单项"
                  style={{ borderTop: "1px solid var(--线)", marginTop: 4, paddingTop: 8 }}
                  onClick={() => {
                    set显示书架(false)
                    void 打开书库()
                  }}
                >
                  选择其他目录…
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="主体"
        style={{ gridTemplateColumns: 左宽 + "px 6px minmax(340px, 1fr) 6px " + 右宽 + "px" }}
      >
        <左栏
          项目={项目}
          当前章={章节号}
          选章={选章}
          看板={看板}
          待裁定={待裁定}
          页={左页}
          切页={(页) => {
            set左页(页)
            if (页 === "章节") set文件(null)
          }}
          当前文件={文件 ? 文件.相对路径 : null}
          打开文件={(相对路径: string) => void 打开文件(相对路径)}
        />
        <div
          className={"分隔条" + (拖侧 === "左" ? " 拖拽中" : "")}
          onPointerDown={起拖("左")}
          title="拖动调整左栏宽度"
        />
        {文件 ? (
          <文件视图 内容={文件} 保存={保存文件} 关闭={() => set文件(null)} />
        ) : 中栏视图 === "全书" ? (
          <视觉总览
            项目={项目}
            看板={看板}
            打开文件={(相对路径: string) => void 打开文件(相对路径)}
            切回编辑={() => set中栏视图("编辑")}
          />
        ) : (
        <正文编辑
          已开书库={Boolean(项目)}
          编号={章节号}
          标题={标题}
          正文={正文}
          脏={脏}
          改={(新正文) => {
            set正文(新正文)
            set脏(true)
          }}
          保存={保存}
          报选区={() => {
            /* 选区暂时没有消费者：改写已改成直接跟 agent 说，等 task-20 的工具再来取 */
          }}
          状态字={状态字}
          切总览={() => set中栏视图("全书")}
        />
        )}
        <div
          className={"分隔条" + (拖侧 === "右" ? " 拖拽中" : "")}
          onPointerDown={起拖("右")}
          title="拖动调整右栏宽度"
        />
        <div className="右栏">
          <AI面板
            消息们={消息们}
            追加={追加}
            改条={改条}
            补条={补条}
            项目={项目}
            章节号={章节号}
            标题={标题}
            正文={正文}
            设定={设定}
            看板={看板}
            成员们={成员们}
            派活={(任务: string) => void 派活(任务)}
            清空对话={清空对话}
            导出对话={导出对话}
            忙={派活中}
          />
        </div>
      </div>

      {显示设置 && 设定 ? (
        <设置面板
          设定={设定}
          关闭={() => set显示设置(false)}
          存好={(新设定) => {
            set设定(新设定)
            套用外观(新设定.外观)
            set显示设置(false)
          }}
          成员们={成员们}
          派活中={派活中}
          章节号={章节号}
          派活={派活}
          新建成员={新建成员}
          删除成员={删除成员}
          改成员={改成员}
          待裁定数={本章条目.length}
          看待裁定={() => {
            set显示设置(false)
            set左页("建议")
          }}
        />
      ) : null}
    </div>
  )
}
