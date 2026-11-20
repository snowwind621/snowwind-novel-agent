// 只负责一件事：编辑网关地址、密钥与四个角色的模型分工。
import React, { useState } from "react"
import { 桥 } from "./接口"
import type { 设置 } from "./接口"

export function 设置面板(属性: {
  设定: 设置
  关闭: () => void
  存好: (新设定: 设置) => void
}) {
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

        <div className="底部行">
          <button onClick={属性.关闭}>取消</button>
          <button onClick={存}>保存</button>
        </div>
      </div>
    </div>
  )
}
