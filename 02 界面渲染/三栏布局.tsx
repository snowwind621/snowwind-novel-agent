// 只负责一件事：拼起三栏，持有全局状态（当前章、看板、集群、对话）。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 千字 } from "./接口"
import type { 项目摘要, 看板数据, 设置, 集群成员, 对话条目 } from "./接口"
import { 左栏 } from "./左栏"
import { 正文编辑 } from "./正文编辑"
import { AI面板 } from "./AI面板"
import { 设置面板 } from "./设置面板"

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
  const [主题, set主题] = useState<string>(document.documentElement.dataset.主题 ?? "暗")
  const [成员们, set成员们] = useState<集群成员[]>([])
  const [派活中, set派活中] = useState(false)
  const [显示导出, set显示导出] = useState(false)
  const 派活占位 = useRef("")
  const 续写请求号 = useRef("")
  const [续写中, set续写中] = useState(false)
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
      localStorage.setItem("对话", JSON.stringify(消息们.slice(-80)))
    } catch {
      /* 存不下就算了，不影响写作 */
    }
  }, [消息们])

  useEffect(() => {
    const 卸载 = 桥.监听对话((事件) => {
      if (!事件.请求号.startsWith("续-") || 事件.请求号 !== 续写请求号.current) return
      if (事件.类型 === "思考") {
        set状态字((旧) => (旧 === "正在续写…" ? "模型在构思，马上落笔…" : 旧))
      } else if (事件.类型 === "正文") {
        set正文((旧) => 旧 + 事件.文本)
        set脏(true)
        set状态字("正在续写…")
      } else if (事件.类型 === "结束") {
        set续写中(false)
        set状态字("续写完成，记得保存")
      } else if (事件.类型 === "错误") {
        set续写中(false)
        set状态字("续写失败：" + 事件.文本)
      }
    })
    return 卸载
  }, [])

  useEffect(() => {
    const 卸载 = 桥.监听派活((事件) => {
      const id = 派活占位.current
      if (!id) return
      const 行 = "正在召集负责人… " + 事件.完成数 + "/" + 事件.总数 + "　" + (事件.阶段 === "完成" ? "✓ " : "… ") + 事件.成员
      set消息们((旧) => 旧.map((条) => (条.id === id ? { ...条, 文本: 行 } : 条)))
    })
    return 卸载
  }, [])

  const 切主题 = () => {
    const 新主题 = 主题 === "暗" ? "亮" : "暗"
    set主题(新主题)
    document.documentElement.dataset.主题 = 新主题
    localStorage.setItem("主题", 新主题)
  }

  const 追加 = (条: 对话条目) => set消息们((旧) => [...旧, 条])
  const 改条 = (id: string, 补: string) =>
    set消息们((旧) => 旧.map((条) => (条.id === id ? { ...条, 文本: 条.文本 + 补 } : 条)))
  const 完成 = (id: string) => set消息们((旧) => 旧.map((条) => (条.id === id ? { ...条, 进行中: false } : 条)))

  useEffect(() => {
    void (async () => {
      set设定(await 桥.读取设置())
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

  const 打开书库 = async () => {
    const 是外壳 = Boolean((window as any).桥)
    const 路径 = 是外壳 ? "" : window.prompt("输入书库根目录（含 project.yaml 的那一层）", 项目?.路径 ?? "") ?? ""
    if (!是外壳 && !路径.trim()) return
    const 结果 = await 桥.打开项目(路径)
    if (!结果) return
    set项目(结果)
    set看板(await 桥.读取看板())
    set成员们(await 桥.集群成员())
    set脏(false)
    const 末章 = 结果.统计.最新章节 || 结果.卷[0]?.章节[0]?.编号 || 0
    if (末章) {
      const 读 = await 桥.读取章节(末章)
      set章节号(读.编号)
      set标题(读.标题)
      set正文(读.正文)
    }
  }

  const 选章 = async (编号: number) => {
    if (脏 && !window.confirm("当前章节有未保存的修改，仍要切换吗？")) return
    const 读 = await 桥.读取章节(编号)
    set章节号(读.编号)
    set标题(读.标题)
    set正文(读.正文)
    set脏(false)
    set状态字("")
  }

  const 同步台账 = async (编号: number) => {
    set状态字("台账同步中…")
    try {
      const 结果 = await 桥.台账同步(编号)
      set状态字(结果.说明)
      set看板(await 桥.读取看板())
    } catch (错误: any) {
      set状态字("台账同步失败：" + String(错误?.message ?? 错误))
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
    if (派活中 || 章节号 === null) return
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

  const 续写 = async () => {
    if (章节号 === null || 续写中) return
    const 请求号 = "续-" + Date.now()
    续写请求号.current = 请求号
    set续写中(true)
    set状态字("正在续写…")
    try {
      await 桥.续写({
        请求号,
        模型: 设定?.分工.执笔 ?? "",
        章节号,
        标题,
        已有正文: 正文,
      })
    } catch (错误: any) {
      set续写中(false)
      set状态字("续写失败：" + String(错误?.message ?? 错误))
    }
  }

  const 停止续写 = async () => {
    if (!续写请求号.current) return
    await 桥.中止对话(续写请求号.current)
    set续写中(false)
    set状态字("已停止续写")
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

  const 追加正文 = (文本: string) => {
    set正文((旧) => 旧.replace(/\s+$/, "") + "\n\n" + 文本.trim() + "\n")
    set脏(true)
    set状态字("已插入正文，记得保存")
  }

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
          <button onClick={切主题} title="切换明暗">
            {主题 === "暗" ? "☀ 日间" : "🌙 夜间"}
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => set显示导出((旧) => !旧)}>导出</button>
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
          <button onClick={() => set显示设置(true)}>设置</button>
          <button onClick={打开书库}>打开书库</button>
        </div>
      </div>

      <div className="主体">
        <左栏
          项目={项目}
          当前章={章节号}
          选章={选章}
          看板={看板}
          成员们={成员们}
          派活中={派活中}
          派活={派活}
          新建成员={新建成员}
          删除成员={删除成员}
          改成员={改成员}
        />
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
          同步台账={() => 章节号 !== null && 同步台账(章节号)}
          续写={续写}
          停止续写={停止续写}
          续写中={续写中}
          状态字={状态字}
        />
        <div className="右栏">
          <AI面板
            消息们={消息们}
            追加={追加}
            改条={改条}
            完成={完成}
            项目={项目}
            章节号={章节号}
            标题={标题}
            正文={正文}
            设定={设定}
            看板={看板}
            追加正文={追加正文}
          />
        </div>
      </div>

      {显示设置 && 设定 ? (
        <设置面板
          设定={设定}
          关闭={() => set显示设置(false)}
          存好={(新设定) => {
            set设定(新设定)
            set显示设置(false)
          }}
        />
      ) : null}
    </div>
  )
}
