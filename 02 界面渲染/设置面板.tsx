// 只负责一件事：设置弹窗——外观 / 编辑器 / 模型 / 上下文 / 智能体 / 书库六个页签。
import React, { useState } from "react"
import { 桥 } from "./接口"
import type { 设置, 外观设置, 编辑器设置, 模型设置, 上下文设置, 智能体设置, 技能项, 集群成员 } from "./接口"
import { 集群面板 } from "./集群面板"
import { 取默认设置 } from "../14 配置密钥/默认设置"
import { 图标 } from "./图标"
import type { 图标名 } from "./图标"

type 设置页 = "外观" | "编辑器" | "模型" | "上下文" | "智能体" | "书库"

const 页们: 设置页[] = ["外观", "编辑器", "模型", "上下文", "智能体", "书库"]

const 页图标: Record<设置页, 图标名> = {
  外观: "调色板",
  编辑器: "笔",
  模型: "芯片",
  上下文: "层",
  智能体: "用户群",
  书库: "书本",
}

/** 数字框输入非法时给个兜底，真正夹上下限的是保存时后端的 规范设置。 */
function 取数(文本: string, 兜底: number): number {
  const 数 = Number(文本)
  return Number.isFinite(数) ? 数 : 兜底
}

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
  const [页, set页] = useState<设置页>("外观")
  const [草稿, set草稿] = useState<设置>(属性.设定)
  const [清单, set清单] = useState<string[]>([])
  const [提示, set提示] = useState("")
  const [迁移提示, set迁移提示] = useState("")

  const 改外观 = (键: keyof 外观设置, 值: 外观设置[keyof 外观设置]) =>
    set草稿({ ...草稿, 外观: { ...草稿.外观, [键]: 值 } })
  const 改编辑器 = (键: keyof 编辑器设置, 值: 编辑器设置[keyof 编辑器设置]) =>
    set草稿({ ...草稿, 编辑器: { ...草稿.编辑器, [键]: 值 } })
  const 改模型 = (键: keyof 模型设置, 值: 模型设置[keyof 模型设置]) =>
    set草稿({ ...草稿, 模型: { ...草稿.模型, [键]: 值 } })
  const 改上下文 = (键: keyof 上下文设置, 值: 上下文设置[keyof 上下文设置]) =>
    set草稿({ ...草稿, 上下文: { ...草稿.上下文, [键]: 值 } })
  const 改智能体 = (键: keyof 智能体设置, 值: 智能体设置[keyof 智能体设置]) =>
    set草稿({ ...草稿, 智能体: { ...草稿.智能体, [键]: 值 } })
  const 改分工 = (键: keyof 模型设置["分工"], 值: string) =>
    set草稿({ ...草稿, 模型: { ...草稿.模型, 分工: { ...草稿.模型.分工, [键]: 值 } } })
  const 改人格 = (键: keyof 智能体设置["人格"], 值: string) =>
    set草稿({ ...草稿, 智能体: { ...草稿.智能体, 人格: { ...草稿.智能体.人格, [键]: 值 } } })

  const 改技能 = (序: number, 补丁: Partial<技能项>) => {
    const 新 = 草稿.智能体.技能.map((项, 位) => (位 === 序 ? { ...项, ...补丁 } : 项))
    改智能体("技能", 新)
  }
  const 加技能 = () => 改智能体("技能", [...草稿.智能体.技能, { 名称: "", 内容: "", 默认附加: false }])
  const 删技能 = (序: number) => 改智能体("技能", 草稿.智能体.技能.filter((_, 位) => 位 !== 序))

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

  const 存 = async () => {
    const 已存 = await 桥.保存设置(草稿)
    属性.存好(已存)
  }

  const 恢复默认 = () => {
    if (!window.confirm("除「上次打开的书库」外，全部设置回到默认值？")) return
    const 默认 = 取默认设置()
    set草稿({ ...默认, 书库: 草稿.书库 })
  }

  const 数字项 = (标签: string, 说明: string, 值: number, 键: (新值: number) => void, 步进 = 1) => (
    <div className="设置项" key={标签}>
      <label>{标签}</label>
      <input
        className="数字框"
        type="number"
        step={步进}
        value={String(值)}
        onChange={(事件) => 键(取数(事件.target.value, 值))}
      />
      <div className="设置说明">{说明}</div>
    </div>
  )

  return (
    <div className="遮罩" onClick={属性.关闭}>
      <div className="设置框" onClick={(事件) => 事件.stopPropagation()}>
        <div className="设置头">
          <h2>设置</h2>
          <div className="微信息">密钥只存在本机，不会写进书库目录。</div>
        </div>

        <div className="设置页签">
          {页们.map((名) => (
            <button key={名} className={"设置页签按钮" + (页 === 名 ? " 选中" : "")} onClick={() => set页(名)} title={"设置：" + 名}>
              <图标 名={页图标[名]} 大小={15} />
              {名}
            </button>
          ))}
        </div>

        <div className="设置内容">
          {页 === "外观" ? (
            <>
              <div className="设置项">
                <label>主题</label>
                <select value={草稿.外观.主题} onChange={(事件) => 改外观("主题", 事件.target.value as 外观设置["主题"])}>
                  <option value="暗">暗</option>
                  <option value="亮">亮</option>
                  <option value="跟随系统">跟随系统</option>
                </select>
                <div className="设置说明">跟随系统时会按系统的深浅色自动切换；顶栏的日/夜按钮改的是同一个值。</div>
              </div>
              {数字项("界面字号 px", "整个界面的基准字号，12–18。", 草稿.外观.界面字号, (值) => 改外观("界面字号", 值))}
              <div className="设置项">
                <label>编辑器字体</label>
                <select value={草稿.外观.编辑器字体} onChange={(事件) => 改外观("编辑器字体", 事件.target.value as 外观设置["编辑器字体"])}>
                  <option value="系统">系统</option>
                  <option value="宋体">宋体</option>
                  <option value="黑体">黑体</option>
                </select>
                <div className="设置说明">只影响正文编辑区的字体。</div>
              </div>
              {数字项("编辑器字号 px", "正文的字号，13–26。", 草稿.外观.编辑器字号, (值) => 改外观("编辑器字号", 值), 0.5)}
              {数字项("行距", "正文行高倍数，1.2–2.8。", 草稿.外观.行距, (值) => 改外观("行距", 值), 0.05)}
              {数字项("界面缩放", "0.8–1.2，只改视觉大小，三栏拖拽宽度照旧。", 草稿.外观.界面缩放, (值) => 改外观("界面缩放", 值), 0.05)}
            </>
          ) : null}

          {页 === "编辑器" ? (
            <>
              <div className="设置项">
                <label>打开章节时的默认模式</label>
                <select
                  value={草稿.编辑器.默认模式}
                  onChange={(事件) => 改编辑器("默认模式", 事件.target.value as 编辑器设置["默认模式"])}
                >
                  <option value="源码">源码</option>
                  <option value="分屏">分屏</option>
                  <option value="预览">预览</option>
                </select>
                <div className="设置说明">编辑器工具条的初始模式；切换后仍可手动改。</div>
              </div>
              {数字项("自动保存间隔（秒）", "0 = 关掉自动保存；最多 600 秒。", 草稿.编辑器.自动保存秒, (值) => 改编辑器("自动保存秒", 值))}
              <div className="设置项">
                <label className="开关行">
                  <input
                    type="checkbox"
                    checked={草稿.编辑器.显示字数}
                    onChange={(事件) => 改编辑器("显示字数", 事件.target.checked)}
                  />
                  在编辑器头部显示字数
                </label>
                <div className="设置说明">关掉后头部只留保存状态。</div>
              </div>
            </>
          ) : null}

          {页 === "模型" ? (
            <>
              <div className="设置项">
                <label>网关地址（OpenAI 兼容）</label>
                <input value={草稿.模型.网关地址} onChange={(事件) => 改模型("网关地址", 事件.target.value)} />
              </div>
              <div className="设置项">
                <label>API 密钥</label>
                <input
                  type="password"
                  value={草稿.模型.API密钥}
                  onChange={(事件) => 改模型("API密钥", 事件.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div className="设置项">
                <button onClick={拉模型}>拉取模型清单</button>
                <span className="微信息" style={{ marginLeft: 10 }}>{提示}</span>
              </div>
              <div className="两列">
                {(["总编", "执笔", "审校", "助手"] as Array<keyof 模型设置["分工"]>).map((键) => (
                  <div className="设置项" key={键}>
                    <label>{键}</label>
                    {清单.length > 0 ? (
                      <select value={草稿.模型.分工[键]} onChange={(事件) => 改分工(键, 事件.target.value)}>
                        {清单.map((模型) => (
                          <option key={模型} value={模型}>
                            {模型}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={草稿.模型.分工[键]} onChange={(事件) => 改分工(键, 事件.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              {数字项("超时秒", "单次请求最多等多久，10–600。", 草稿.模型.超时秒, (值) => 改模型("超时秒", 值))}
              {数字项("重试次数", "失败后自动重试几次，0–5。", 草稿.模型.重试次数, (值) => 改模型("重试次数", 值))}
              {数字项("重试间隔秒", "两次重试之间等多久，0–30。", 草稿.模型.重试间隔秒, (值) => 改模型("重试间隔秒", 值))}
              {数字项("温度", "0–2，越高越发散。", 草稿.模型.温度, (值) => 改模型("温度", 值), 0.05)}
              {数字项("最大输出词元", "256–32000。", 草稿.模型.最大输出词元, (值) => 改模型("最大输出词元", 值), 256)}
            </>
          ) : null}

          {页 === "上下文" ? (
            <>
              {数字项("单卡注入字数", "每张设定卡最多塞多少字进提示，200–8000。", 草稿.上下文.单卡注入字数, (值) => 改上下文("单卡注入字数", 值), 100)}
              {数字项("历史保留条数", "对话里保留多少条原文，0–100。", 草稿.上下文.历史保留条数, (值) => 改上下文("历史保留条数", 值))}
              {数字项("压缩触发比例", "上下文用到这个比例就开始压缩，0.3–1。", 草稿.上下文.压缩触发比例, (值) => 改上下文("压缩触发比例", 值), 0.05)}
              {数字项("压缩后保留条数", "压缩后留多少条，0–50。", 草稿.上下文.压缩后保留条数, (值) => 改上下文("压缩后保留条数", 值))}
              <div className="设置说明">这几个值由运行时读取，改了立刻存盘。</div>
            </>
          ) : null}

          {页 === "智能体" ? (
            <>
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
              {数字项("并发数", "同时喊几个负责人，1–8。", 草稿.智能体.并发数, (值) => 改智能体("并发数", 值))}
              {数字项("阵容上限", "一本书最多养几个智能体，1–12。", 草稿.智能体.阵容上限, (值) => 改智能体("阵容上限", 值))}

              <div className="设置分组">六个人格</div>
              <div className="设置说明">{"文案里的「{书名}」会替换成当前书名；改这里等于改这几位的底子。"}</div>
              {(["总编", "审校", "伏笔", "台账", "地点", "物品"] as Array<keyof 智能体设置["人格"]>).map((键) => (
                <div className="设置项" key={键}>
                  <label>{键}</label>
                  <textarea
                    className="人格框"
                    value={草稿.智能体.人格[键]}
                    onChange={(事件) => 改人格(键, 事件.target.value)}
                  />
                </div>
              ))}

              <div className="设置分组">技能 · {草稿.智能体.技能.length}</div>
              <div className="设置说明">每条是一段附加指令；勾了「默认附加」的会随每次派活一起发过去。</div>
              {草稿.智能体.技能.map((项, 序) => (
                <div className="技能项" key={序}>
                  <div className="技能头">
                    <input
                      placeholder="技能名称"
                      value={项.名称}
                      onChange={(事件) => 改技能(序, { 名称: 事件.target.value })}
                    />
                    <label className="开关行">
                      <input type="checkbox" checked={项.默认附加} onChange={(事件) => 改技能(序, { 默认附加: 事件.target.checked })} />
                      默认附加
                    </label>
                    <button className="小按钮" onClick={() => 删技能(序)}>
                      删除
                    </button>
                  </div>
                  <textarea
                    className="人格框"
                    placeholder="这段附加指令的内容"
                    value={项.内容}
                    onChange={(事件) => 改技能(序, { 内容: 事件.target.value })}
                  />
                </div>
              ))}
              <button onClick={加技能}>＋ 添加技能</button>
            </>
          ) : null}

          {页 === "书库" ? (
            <>
              <div className="设置项">
                <label>上次打开的书库</label>
                <input value={草稿.书库.上次路径} readOnly />
                <div className="设置说明">这个值跟着「打开书库」自动更新，不用手改。</div>
              </div>
              <div className="设置项">
                <label>书库迁移（旧格式 → 雪风卷宗，旧目录只读不动）</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={导入旧书库}>从旧格式导入…</button>
                  <span className="微信息">{迁移提示}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="底部行">
          <button className="恢复默认" onClick={恢复默认}>
            恢复默认
          </button>
          <button onClick={属性.关闭}>取消</button>
          <button onClick={存}>保存</button>
        </div>
      </div>
    </div>
  )
}
