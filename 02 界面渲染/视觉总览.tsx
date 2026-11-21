// 只负责一件事：中栏「数据」面板——左边分类导航，右边每类台账的专属界面（只读、手绘 SVG）。
import React, { useEffect, useRef, useState } from "react"
import { 桥, 千字 } from "./接口"
import type { 知情结果, 看板数据, 项目摘要 } from "./接口"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"
import { 进度环, 字数柱, 伏笔甘特, 人物条, 时间轴, 关系网, 热力矩阵, 属性条 } from "./图表"
import type { 章点, 伏笔条, 人物条项, 时间点, 关系边, 热力行 } from "./图表"
import { 解析表格 } from "../10 书库检索/台账解析"

type 分类 = "总览" | "时间线" | "人物" | "伏笔" | "关系" | "秘密" | "物品" | "队伍" | "出场"

const 分类们: Array<{ 名: 分类; 图标: 图标名; 说明: string }> = [
  { 名: "总览", 图标: "表格", 说明: "进度、字数节奏、伏笔概况" },
  { 名: "时间线", 图标: "列表", 说明: "日期 → 事件 → 章" },
  { 名: "人物", 图标: "用户群", 说明: "谁在场、谁久没露面、属性变化" },
  { 名: "伏笔", 图标: "灯泡", 说明: "埋与兑的生命周期" },
  { 名: "关系", 图标: "层", 说明: "人物关系网" },
  { 名: "秘密", 图标: "关闭", 说明: "现在不能揭的事" },
  { 名: "物品", 图标: "文件夹", 说明: "物件在哪、什么状态" },
  { 名: "队伍", 图标: "用户群", 说明: "队伍层面的现值" },
  { 名: "出场", 图标: "眼睛", 说明: "人物 × 章 的热力矩阵" },
]

/** 台账文件 → 相对路径；读不到就整块走空态。 */
const 台账文件 = {
  时间线: "台账/时间线.md",
  出场追踪: "台账/出场追踪.md",
  属性变更: "台账/属性变更.md",
  关系线: "台账/关系线.md",
  物品台账: "台账/物品台账.md",
  队伍状态: "台账/队伍状态.md",
  禁揭清单: "情节/情节-03-禁揭清单.md",
}

/** 中栏顶部的「视图」级切换：编辑 / 数据。正文编辑那边也用它，保证两条是一样的按钮。 */
export function 视图切换(属性: { 当前: "编辑" | "全书"; 切: (视图: "编辑" | "全书") => void }) {
  return (
    <div className="编辑器-模式">
      <button className={"编辑器-模式按钮" + (属性.当前 === "编辑" ? " 选中" : "")} onClick={() => 属性.切("编辑")} title="回到正文编辑">
        <图标 名="笔" 大小={15} />
        编辑
      </button>
      <button className={"编辑器-模式按钮" + (属性.当前 === "全书" ? " 选中" : "")} onClick={() => 属性.切("全书")} title="看全书的数据面板">
        <图标 名="表格" 大小={15} />
        数据
      </button>
    </div>
  )
}

/** 找一张含指定列的表；没有就 null（各面板据此走空态）。 */
function 找表(正文: string, 必须列: string[]) {
  for (const 表 of 解析表格(正文)) {
    const 列号 = 必须列.map((列) => 表.表头.findIndex((头) => 头.includes(列)))
    if (列号.every((号) => 号 >= 0)) return { 表, 列号 }
  }
  return null
}

function 取格(行: string[], 号: number): string {
  return (行[号] ?? "").replace(/\*\*/g, "").replace(/\*/g, "").trim()
}

/** 从「ch1-27 全程」「ch3、ch5」「1,3-5」里抠出章号集合。 */
function 解析出场章(文本: string, 总章: number): number[] {
  const 出 = new Set<number>()
  for (const 片 of String(文本 ?? "").split(/[，,、；;\s]+/)) {
    const 范围 = /^(?:ch)?\s*(\d+)\s*[-–~～]\s*(?:ch)?\s*(\d+)$/i.exec(片)
    if (范围) {
      const 起 = Number(范围[1])
      const 止 = Number(范围[2])
      for (let 章 = Math.max(1, 起); 章 <= Math.min(总章, 止); 章++) 出.add(章)
      continue
    }
    const 单 = /^(?:ch)?\s*(\d+)$/i.exec(片)
    if (单) 出.add(Number(单[1]))
  }
  return [...出].filter((章) => 章 >= 1 && 章 <= 总章).sort((甲, 乙) => 甲 - 乙)
}

export function 视觉总览(属性: {
  项目: 项目摘要 | null
  看板: 看板数据 | null
  打开文件: (相对路径: string) => void
  切回编辑: () => void
  /** 看板/台账被外部刷新时 +1，用来强制重读台账文件 */
  版次?: number
}) {
  const [分类, set分类] = useState<分类>("总览")
  const [文件们, set文件们] = useState<Record<string, string>>({})
  const [读了, set读了] = useState(false)
  const [伏笔筛, set伏笔筛] = useState<"全部" | "超期" | "久置" | "待兑" | "已兑">("全部")
  /** 阅读游标：0 = 跟到最新；>0 = 只看到第 N 章（存本地，换分类不重置） */
  const [读到, set读到] = useState<number>(() => {
    const 存 = Number(localStorage.getItem("阅读游标"))
    return Number.isFinite(存) && 存 > 0 ? 存 : 0
  })
  const [知情数据, set知情数据] = useState<知情结果 | null>(null)
  const [提示, set提示] = useState<{ 左: number; 上: number; 文: string } | null>(null)
  const 壳 = useRef<HTMLDivElement | null>(null)

  // 一次把面板要用的几份台账读进来（都是小文件）；读不到的那份走它自己的空态。
  useEffect(() => {
    if (!属性.项目) return
    let 有效 = true
    set读了(false)
    void (async () => {
      const 结果: Record<string, string> = {}
      await Promise.all(
        Object.entries(台账文件).map(async ([键, 相对]) => {
          try {
            const 内容 = await 桥.书库读文件(相对)
            结果[键] = 内容.是文本 ? 内容.文本 : ""
          } catch {
            结果[键] = ""
          }
        }),
      )
      if (!有效) return
      set文件们(结果)
      set读了(true)
    })()
    return () => {
      有效 = false
    }
  }, [属性.项目?.路径, 属性.版次])

  const 悬停 = (水平: number, 垂直: number, 文: string) => {
    const 框 = 壳.current?.getBoundingClientRect()
    set提示({ 左: 水平 - (框?.left ?? 0) + 12, 上: 垂直 - (框?.top ?? 0) + 14, 文 })
  }

  if (!属性.项目) {
    return (
      <div className="中栏">
        <div className="编辑器-工具行">
          <视图切换 当前="全书" 切={() => 属性.切回编辑()} />
        </div>
        <div className="空态">还没有打开书库；打开后这里会画出全书的数据。</div>
      </div>
    )
  }

  const 最新章节 = 属性.项目.统计.最新章节 || 0
  /** 游标：0 表示跟到最新；否则截到第 N 章，所有视图都按它算 */
  const 游标 = 读到 > 0 ? Math.min(读到, 最新章节) : 最新章节
  const 章们: 章点[] = 属性.项目.卷
    .flatMap((卷) => 卷.章节.map((章) => ({ 编号: 章.编号, 标题: 章.标题, 字数: 章.字数 })))
    .filter((章) => 章.编号 <= 游标)
  const 章数 = 章们.length
  const 总字 = 章们.reduce((和, 章) => 和 + 章.字数, 0)
  const 均值 = 章数 > 0 ? Math.round(总字 / 章数) : 0
  // 伏笔按游标重算：游标之后才兑的，到游标这一刻仍然「未兑」
  const 伏笔们: 伏笔条[] = (属性.看板?.伏笔 ?? [])
    .filter((项) => 项.埋章 === null || 项.埋章 <= 游标)
    .map((项) => {
      const 兑章 = 项.兑章.filter((章) => 章 <= 游标)
      const 已兑 = 兑章.length > 0
      const 搁置 = 项.埋章 === null ? 项.搁置章数 : Math.max(0, 游标 - 项.埋章)
      return {
        编号: 项.编号,
        名称: 项.名称,
        埋章: 项.埋章,
        兑章,
        预定章: 项.预定章.filter((章) => 章 <= 游标),
        状态: 已兑 ? "已兑现" : "待兑现",
        搁置章数: 已兑 ? 项.搁置章数 : 搁置,
        超期: !已兑 && 项.超期,
        久置: !已兑 && 项.久置,
      }
    })
  const 已兑现 = 伏笔们.filter((项) => 项.状态 === "已兑现").length
  const 伏笔总 = 伏笔们.length
  const 兑现率 = 伏笔总 > 0 ? 已兑现 / 伏笔总 : 0
  const 超期数 = 伏笔们.filter((项) => 项.超期).length

  /** 点 chN：切回编辑打开那一章；带行号就滚到那一行并闪一下。 */
  const 跳章 = (章: number, 行?: number) => {
    const 文件 = (属性.项目?.卷 ?? []).flatMap((卷) => 卷.章节).find((项) => 项.编号 === 章)?.文件
    if (!文件) return
    属性.打开文件(文件)
    if (!行) return
    window.setTimeout(() => {
      const 富 = document.querySelector(".编辑器-富文本")
      if (!富) return
      const 块 = 富.children[Math.min(Math.max(0, 行 - 1), Math.max(0, 富.children.length - 1))] as HTMLElement | undefined
      if (!块) return
      块.scrollIntoView({ block: "center" })
      块.classList.add("行高亮")
      window.setTimeout(() => 块.classList.remove("行高亮"), 2400)
    }, 700)
  }

  /** 把「ch27 L131」这类依据切成可点的章链。 */
  const 章链 = (文本: string) => {
    const 正则 = /ch\s*(\d+)(?:\s*[L＃#]\s*(\d+))?/gi
    const 出: React.ReactNode[] = []
    let 上 = 0
    let 匹配: RegExpExecArray | null
    while ((匹配 = 正则.exec(文本))) {
      if (匹配.index > 上) 出.push(文本.slice(上, 匹配.index))
      const 章 = Number(匹配[1])
      const 行 = 匹配[2] ? Number(匹配[2]) : undefined
      出.push(
        <button key={匹配.index} className="章链" onClick={() => 跳章(章, 行)} title={"回到 ch" + 章 + (行 ? " 第 " + 行 + " 行" : "")}>
          {"ch" + 章}
        </button>,
      )
      上 = 匹配.index + 匹配[0].length
    }
    if (上 < 文本.length) 出.push(文本.slice(上))
    return 出
  }

  // 知情数据：数据层给了就画矩阵，没给（或通道还没上线）就落空态。
  useEffect(() => {
    if (!属性.项目) return
    const 取 = 桥.查知情
    if (!取) {
      set知情数据(null)
      return
    }
    let 有效 = true
    void 取(undefined, undefined, 游标)
      .then((结果) => {
        if (有效) set知情数据(结果)
      })
      .catch(() => {
        if (有效) set知情数据(null)
      })
    return () => {
      有效 = false
    }
  }, [属性.项目?.路径, 游标])

  const 渲染面板 = () => {
    if (分类 === "总览") {
      return (
        <div className="数据块">
          <div className="数据块头">
            <span>进度</span>
            <span>{属性.项目!.书名}</span>
          </div>
          <div className="概览行">
            <进度环 比例={兑现率} 主文={Math.round(兑现率 * 100) + "%"} 副文={已兑现 + "/" + 伏笔总 + " 伏笔"} />
            <div className="关键数">
              <div className="数项"><b>{千字(总字)}</b><span>总字数</span></div>
              <div className="数项"><b>{章数}</b><span>章数</span></div>
              <div className="数项"><b>{均值.toLocaleString("zh-CN")}</b><span>平均章长</span></div>
              <div className="数项"><b>{"ch" + 最新章节}</b><span>最新章</span></div>
              <div className={"数项" + (超期数 ? " 危" : "")}><b>{超期数}</b><span>超期伏笔（到 ch{游标}）</span></div>
            </div>
          </div>
          <div className="数据块头" style={{ marginTop: 18 }}>
            <span>每章字数</span>
            <span>均值 {均值.toLocaleString("zh-CN")} 字 · 短章黄 / 长章蓝</span>
          </div>
          {章数 === 0 ? <div className="数据空">还没有章节</div> : (
            <div className="图滚"><字数柱 章们={章们} 均值={均值} 悬停={悬停} 离开={() => set提示(null)} /></div>
          )}
          <div className="数据块头" style={{ marginTop: 18 }}>
            <span>台账</span>
            <span>{属性.看板?.台账.length ?? 0} 册 · 点卡片看原文</span>
          </div>
          <div className="台账墙">
            {(属性.看板?.台账 ?? []).map((卡) => (
              <button key={卡.相对路径} className="台账卡" title={卡.相对路径} onClick={() => 属性.打开文件(卡.相对路径)}>
                <div className="台账卡头"><span>{卡.名称}</span><span className="徽">{卡.行数} 行</span></div>
                <div className="台账卡摘">{卡.摘录 || "（空）"}</div>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (分类 === "伏笔") {
      const 筛后 = 伏笔们.filter((项) =>
        伏笔筛 === "超期" ? 项.超期
          : 伏笔筛 === "久置" ? 项.久置
            : 伏笔筛 === "待兑" ? 项.状态 === "待兑现"
              : 伏笔筛 === "已兑" ? 项.状态 === "已兑现"
                : true,
      )
      const 排序后 = [...筛后].sort((甲, 乙) => Number(乙.超期) - Number(甲.超期) || Number(乙.久置) - Number(甲.久置))
      return (
        <div className="数据块">
          <div className="数据块头">
            <span>伏笔生命周期</span>
            <span>● 埋点　■ 兑点　红=超期　橙=久置</span>
          </div>
          <div className="数据筛选">
            {(["全部", "超期", "久置", "待兑", "已兑"] as const).map((项) => (
              <button key={项} className={"分段按钮" + (伏笔筛 === 项 ? " 选中" : "")} onClick={() => set伏笔筛(项)}>
                {项}　{项 === "全部" ? 伏笔们.length : 项 === "超期" ? 伏笔们.filter((x) => x.超期).length : 项 === "久置" ? 伏笔们.filter((x) => x.久置).length : 项 === "待兑" ? 伏笔们.filter((x) => x.状态 === "待兑现").length : 伏笔们.filter((x) => x.状态 === "已兑现").length}
              </button>
            ))}
          </div>
          {排序后.length === 0 ? <div className="数据空">这一类里没有伏笔</div> : (
            <div className="图滚"><伏笔甘特 伏笔们={排序后} 最新章节={游标} 悬停={悬停} 离开={() => set提示(null)} 点跳={(章) => 跳章(章)} /></div>
          )}
        </div>
      )
    }

    if (分类 === "时间线") {
      const 命中 = 找表(文件们.时间线 ?? "", ["日期", "事件"])
      if (!命中) return <div className="数据空">台账/时间线.md 里没读到「日期 / 事件 / 章节」三列</div>
      const { 表, 列号 } = 命中
      const 点们: 时间点[] = 表.行
        .map((行) => ({ 日期: 取格(行, 列号[0]), 事件: 取格(行, 列号[1]), 章: 列号[2] >= 0 ? 取格(行, 列号[2]) : "" }))
        .filter((点) => 点.日期 || 点.事件)
        .filter((点) => {
          const 章 = Number((/\d+/.exec(点.章) ?? ["0"])[0])
          return !点.章 || 章 <= 游标
        })
      if (点们.length === 0) return <div className="数据空">时间线是空的</div>
      return (
        <div className="数据块">
          <div className="数据块头"><span>时间线</span><span>{点们.length} 条 · 按书里顺序排</span></div>
          <时间轴 点们={点们} 悬停={悬停} 离开={() => set提示(null)} />
        </div>
      )
    }

    if (分类 === "人物") {
      const 出场命中 = 找表(文件们.出场追踪 ?? "", ["姓名", "最后出场"])
      const 属性命中 = 找表(文件们.属性变更 ?? "", ["角色", "属性"])
      if (!出场命中) return <div className="数据空">台账/出场追踪.md 里没读到「姓名 / 最后出场」两列</div>
      const 人 = 出场命中.表.行
        .map((行) => {
          const 名 = 取格(行, 出场命中.列号[0])
          const 末 = Number((/\d+/.exec(取格(行, 出场命中.列号[1])) ?? [""])[0])
          return { 名, 末: Number.isFinite(末) ? Math.min(末, 游标) : 0 }
        })
        .filter((项) => 项.名)
      if (人.length === 0) return <div className="数据空">出场追踪表是空的</div>
      return (
        <div className="数据块">
          <div className="数据块头"><span>人物</span><span>{人.length} 人 · 缺席 = ch{游标} − 最后出场</span></div>
          <div className="人物格">
            {人.map((项) => {
              const 缺席 = 游标 - 项.末
              const 变化 = 属性命中
                ? 属性命中.表.行
                    .filter((行) => 取格(行, 属性命中.列号[0]).includes(项.名))
                    .slice(-3)
                    .map((行) => {
                      const 旧新 = 取格(行, 属性命中.列号.find((号) => 号 >= 0 && 属性命中.表.表头[号].includes("旧")) ?? 属性命中.列号[0])
                      const 数 = /(\d+)\s*(?:→|->)\s*(\d+)/.exec(旧新)
                      return { 名称: 取格(行, 属性命中.列号[1]), 旧: 数 ? Number(数[1]) : null, 新: 数 ? Number(数[2]) : null }
                    })
                : []
              return (
                <div key={项.名} className={"人物卡" + (缺席 > 10 ? " 久未出场" : "")}>
                  <div className="人物卡头">
                    <span className="人物卡名">{项.名}</span>
                    {项.末 > 0 ? <button className="章链" onClick={() => 跳章(项.末)} title={"回到 ch" + 项.末}>{"ch" + 项.末}</button> : <span className="徽">ch—</span>}
                  </div>
                  <div className="人物卡元">
                    {缺席 > 0 ? "缺席 " + 缺席 + " 章" : "本章在场"}
                  </div>
                  {变化.length > 0 ? <属性条 项们={变化} /> : <div className="数据空 小">没有属性变化记录</div>}
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    if (分类 === "关系") {
      const 命中 = 找表(文件们.关系线 ?? "", ["编号", "关系对"])
      if (!命中) return <div className="数据空">台账/关系线.md 里没读到「编号 / 关系对」两列</div>
      const 边们: 关系边[] = 命中.表.行
        .map((行) => ({
          编号: 取格(行, 命中.列号[0]),
          关系对: 取格(行, 命中.列号[1]),
          章: 命中.列号[2] >= 0 ? 取格(行, 命中.列号[2]) : "",
          变化: 命中.表.表头.findIndex((头) => 头.includes("变化")) >= 0 ? 取格(行, 命中.表.表头.findIndex((头) => 头.includes("变化"))) : "",
        }))
        .filter((边) => 边.关系对)
        .filter((边) => !边.章 || Number((/\d+/.exec(边.章) ?? ["0"])[0]) <= 游标)
      if (边们.length === 0) return <div className="数据空">关系线是空的</div>
      return (
        <div className="数据块">
          <div className="数据块头"><span>关系网</span><span>{边们.length} 条边 · 悬停看变化经过</span></div>
          <关系网 边们={边们} 悬停={悬停} 离开={() => set提示(null)} />
        </div>
      )
    }

    if (分类 === "秘密") {
      const 知情 = 知情数据
      const 正文 = 文件们.禁揭清单 ?? ""
      // 有知情数据就画矩阵：谁在读到 chN 这一刻知道、依据在哪一句
      if (知情 && 知情.条目.length > 0) {
        const 秘密们 = 知情.秘密们.length > 0 ? 知情.秘密们 : Array.from(new Set(知情.条目.map((条) => 条.秘密)))
        const 人 = 知情.人.length > 0 ? 知情.人 : Array.from(new Set(知情.条目.map((条) => 条.人)))
        const 到游标 = 知情.条目.filter((条) => 条.何时知道 === null || 条.何时知道 <= 游标)
        return (
          <div className="数据块">
            <div className="数据块头">
              <span>秘密矩阵</span>
              <span>{秘密们.length} 条秘密 · 读到 ch{游标} 为止的知情状态</span>
            </div>
            <div className="秘密格">
              {秘密们.map((秘密) => {
                const 该条 = 到游标.filter((条) => 条.秘密 === 秘密)
                const 知道 = 该条.map((条) => 条.人)
                const 不知道 = 人.filter((名) => !知道.includes(名))
                return (
                  <div key={秘密} className="秘密卡">
                    <div className="秘密卡头">
                      <b>{秘密}</b>
                      <span className="徽">{知道.length} 人知道 / {不知道.length} 人不知道</span>
                    </div>
                    <div className="秘密双栏">
                      <div className="秘密栏">
                        <div className="秘密栏头">知情</div>
                        {该条.length === 0 ? <div className="数据空 小">读到 ch{游标} 为止还没人知道</div> : null}
                        {该条.map((条, 序) => (
                          <div key={序} className="秘密卡行">
                            <b>{条.人}</b>
                            <span className="秘密时">{条.何时知道 === null ? "何时知道未记" : "ch" + 条.何时知道}</span>
                            {条.依据 ? <span className="秘密依">依据：{章链(条.依据)}</span> : null}
                          </div>
                        ))}
                      </div>
                      <div className="秘密栏">
                        <div className="秘密栏头">不知情</div>
                        {不知道.length === 0 ? <div className="数据空 小">都知道了</div> : null}
                        {不知道.map((名) => <div key={名} className="秘密卡行"> {名}</div>)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }
      const 命中 = 找表(正文, ["编号"]) ?? 找表(正文, ["内容"])
      const 条们 = 命中 ? 命中.表.行.map((行) => 命中.表.表头.map((头, 序) => ({ 列: 头, 值: 取格(行, 序) })).filter((项) => 项.值)) : []
      return (
        <div className="数据块">
          <div className="数据块头"><span>秘密矩阵</span><span>还没有知情数据</span></div>
          <div className="数据空">
            还没读到台账/知情台账.md 里的「秘密 / 人 / 何时知道 / 依据」表，所以这里画不出矩阵。
            <br />
            去补一张知情台账，这里就会按「读到 ch{游标}」的视角分两栏：谁知道、依据在哪一句。
          </div>
          {条们.length > 0 ? (
            <>
              <div className="数据块头" style={{ marginTop: 14 }}><span>禁揭清单</span><span>{条们.length} 条 · 只读</span></div>
              <div className="秘密格">
                {条们.map((条, 序) => (
                  <div key={序} className="秘密卡">
                    {条.map((项, 序2) => (
                      <div key={序2} className={序2 === 0 ? "秘密卡头" : "秘密卡行"}>
                        <b>{项.列}</b>
                        <span>{章链(项.值)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )
    }

    if (分类 === "物品") {
      const 命中 = 找表(文件们.物品台账 ?? "", ["物品"])
      if (!命中) return <div className="数据空">台账/物品台账.md 里还没读到「物品 / 状态」表</div>
      const 表 = 命中.表
      const 列 = 表.表头.filter((头) => 头 && !/^#?$/.test(头)).slice(0, 5)
      return (
        <div className="数据块">
          <div className="数据块头"><span>物品</span><span>{表.行.length} 行</span></div>
          <table className="数据表">
            <thead><tr>{列.map((头, 序) => <th key={序}>{头}</th>)}</tr></thead>
            <tbody>
              {表.行.map((行, 序) => (
                <tr key={序}>{列.map((_, 序2) => <td key={序2}>{取格(行, 序2)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (分类 === "队伍") {
      const 命中 = 找表(文件们.队伍状态 ?? "", ["项"])
      if (!命中) return <div className="数据空">台账/队伍状态.md 里还没读到「项 / 现值」表</div>
      const { 表, 列号 } = 命中
      return (
        <div className="数据块">
          <div className="数据块头"><span>队伍</span><span>{表.行.length} 项 · 现值即当前口径</span></div>
          <table className="数据表">
            <thead><tr><th>项</th><th>现值</th></tr></thead>
            <tbody>
              {表.行.map((行, 序) => (
                <tr key={序}><td>{取格(行, 列号[0])}</td><td>{列号[1] >= 0 ? 取格(行, 列号[1]) : 取格(行, 1)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    // 出场：热力矩阵
    const 命中 = 找表(文件们.出场追踪 ?? "", ["姓名", "最后出场"])
    if (!命中) return <div className="数据空">台账/出场追踪.md 里没读到「姓名 / 最后出场」两列</div>
    const 记录列 = 命中.表.表头.findIndex((头) => 头.includes("出场记录") || 头.includes("记录"))
    const 行们: 热力行[] = 命中.表.行
      .map((行) => ({
        名称: 取格(行, 命中.列号[0]),
        章们: 解析出场章(记录列 >= 0 ? 取格(行, 记录列) : "", 游标),
      }))
      .filter((行) => 行.名称)
    if (行们.length === 0) return <div className="数据空">出场追踪表是空的</div>
    const 有记录的 = 行们.filter((行) => 行.章们.length > 0)
    if (有记录的.length === 0) return <div className="数据空">出场追踪表里没有可解析的「出场记录」列（要写成 ch1-27 或 3,5,7）</div>
    return (
      <div className="数据块">
        <div className="数据块头"><span>出场热力</span><span>行=人物，列=章；深色就是有出场</span></div>
        <div className="图滚"><热力矩阵 行们={行们} 总章={Math.max(1, 游标)} /></div>
      </div>
    )
  }

  return (
    <div className="中栏">
      <div className="编辑器-工具行">
        <视图切换 当前="全书" 切={() => 属性.切回编辑()} />
        <span className="编辑器-分隔" />
        <span className="编辑器-提示">数据面板只读；每类台账一个专属界面，左边切换。</span>
      </div>

      <div className="数据面板" ref={壳}>
        <div className="数据导航">
          {分类们.map((项) => (
            <button key={项.名} className={"数据导航项" + (分类 === 项.名 ? " 选中" : "")} onClick={() => set分类(项.名)} title={项.说明}>
              <图标 名={项.图标} 大小={15} />
              <span>{项.名}</span>
            </button>
          ))}
          <div className="数据导航脚">
            {读了 ? "台账已读入" : "正在读台账…"}
          </div>
        </div>
        <div className="数据体">
          <div className="游标行">
            <span className="游标标签">
              <图标 名="眼睛" 大小={14} />
              读到
            </span>
            <input
              className="游标滑块"
              type="range"
              min={1}
              max={Math.max(1, 最新章节)}
              value={游标}
              onChange={(事件) => set读到(Number(事件.target.value))}
              title="拖动只看第 N 章为止；不剧透后面的"
            />
            <span className="游标值">
              ch{游标} / 共 {最新章节} 章
            </span>
            {游标 !== 最新章节 ? (
              <button className="小按钮" onClick={() => set读到(0)} title="把游标放回最新章">
                跟到最新
              </button>
            ) : null}
            <span className="游标提示">所有视图都按这个游标算</span>
          </div>
          {渲染面板()}
          {提示 ? <div className="图表提示" style={{ left: 提示.左, top: 提示.上 }}>{提示.文}</div> : null}
        </div>
      </div>
    </div>
  )
}
