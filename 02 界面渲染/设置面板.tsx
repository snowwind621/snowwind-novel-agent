// 只负责一件事：设置弹窗——模型接入与智能体集群两个页签。
import React, { useState } from "react"
import { 桥 } from "./接口"
import type { 设置, 集群成员 } from "./接口"
import { 集群面板 } from "./集群面板"

type 设置页 = "模型接入" | "智能体集群"

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
  const [页, set页] = useState<设置页>("模型接入")
  const [草稿, set草稿] = useState<设置>(属性.设定)
  const [清单, set清单] = useState<string[]>([])
  const [提示, set提示] = useState("")
  const [迁移提示, set迁移提示] = useState("")

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

  const 改分工 = (键: keyof 设置["分工"], 值: string) => {
    set草稿({ ...草稿, 分工: { ...草稿.分工, [键]: 值 } })
  }

  const 存 = async () => {
    const 已存 = await 桥.保存设置(草稿)
    属性.存好(已存)
  }

  const 角色: Array<[keyof 设置["分工"], string]> = [
    ["总编", "总编（拆解任务、决定写什么）"],
    ["执笔", "执笔（写正文）"],
    ["审校", "审校（挑矛盾、查伏笔）"],
    ["助手", "助手（右侧对话）"],
  ]

  return (
    <div className="遮罩" onClick={属性.关闭}>
      <div className="设置框" onClick={(事件) => 事件.stopPropagation()}>
        <h2>设置</h2>
        <div className="微信息">密钥只存在本机，不会写进书库目录。</div>

        <div className="设置页签">
          {(["模型接入", "智能体集群"] as 设置页[]).map((名) => (
            <button key={名} className={"设置页签按钮" + (页 === 名 ? " 选中" : "")} onClick={() => set页(名)}>
              {名}
              {名 === "智能体集群" ? " · " + 属性.成员们.length : ""}
            </button>
          ))}
        </div>

        {页 === "模型接入" ? (
          <>
            <div className="字段">
              <label>网关地址（OpenAI 兼容）</label>
              <input value={草稿.网关地址} onChange={(事件) => set草稿({ ...草稿, 网关地址: 事件.target.value })} />
            </div>

            <div className="字段">
              <label>API 密钥</label>
              <input
                type="password"
                value={草稿.API密钥}
                onChange={(事件) => set草稿({ ...草稿, API密钥: 事件.target.value })}
                placeholder="sk-..."
              />
            </div>

            <div className="字段">
              <button onClick={拉模型}>拉取模型清单</button>
              <span className="微信息" style={{ marginLeft: 10 }}>{提示}</span>
            </div>

            <div className="两列">
              {角色.map(([键, 说明]) => (
                <div className="字段" key={键}>
                  <label>{说明}</label>
                  {清单.length > 0 ? (
                    <select value={草稿.分工[键]} onChange={(事件) => 改分工(键, 事件.target.value)}>
                      {清单.map((模型) => (
                        <option key={模型} value={模型}>
                          {模型}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={草稿.分工[键]} onChange={(事件) => 改分工(键, 事件.target.value)} />
                  )}
                </div>
              ))}
            </div>

            <div className="字段">
              <label>书库迁移（旧格式 → 雪风卷宗，旧目录只读不动）</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={导入旧书库}>从旧格式导入…</button>
                <span className="微信息">{迁移提示}</span>
              </div>
            </div>
          </>
        ) : (
          <集群面板
            成员们={属性.成员们}
            章节号={属性.章节号}
            忙={属性.派活中}
            派活={属性.派活}
            新建成员={属性.新建成员}
            删除成员={属性.删除成员}
            改成员={属性.改成员}
            待裁定数={属性.待裁定数}
            看待裁定={属性.看待裁定}
          />
        )}

        <div className="底部行">
          {页 === "模型接入" ? (
            <>
              <button onClick={属性.关闭}>取消</button>
              <button onClick={存}>保存</button>
            </>
          ) : (
            <button onClick={属性.关闭}>关闭</button>
          )}
        </div>
      </div>
    </div>
  )
}