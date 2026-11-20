// 只负责一件事：规定「雪风卷宗」书库长什么样——所有路径只在这一处定义。
export const 格式标识 = "雪风卷宗/1"

export const 路径 = {
  清单: "书卷.yaml",
  正文: "正文",
  设定: "设定",
  台账: "台账",
  情节: "情节",
  校验: "校验",
  留痕: "留痕",
  考据: "考据",
  导航: "导航",
  讨论: "讨论",
  // AI 产出（可随时重生成、不进 canon）统一放「计划」；人写的结构留在 情节/ 与 设定/。
  // 外部软件产出的「设定/面板镜像.json」运行时不再读；只有迁移旧书库时读旧镜像的“参考间隔”（见 16 书库迁移/导入旧书库.ts）。
  计划: "计划",
}

/** 「计划」下三块：全是 AI 产出，随时可以重生成，删了也不心疼（但迁移一律不删，只移动）。 */
export const 计划 = {
  开写包: "计划/开写包",
  待裁定: "计划/待裁定",
  历史: "计划/历史",
}

/** 旧位置：迁移前 AI 产出放过这里，现在原处只留指针。 */
export const 旧计划位置 = {
  开写包: "情节/开写包",
  待裁定: "设定/待裁定",
}

/** 台账七册：所有会随章节变的数据都在这里，别处只写指针。 */
export const 台账册 = {
  时间线: "台账/时间线.md",
  出场追踪: "台账/出场追踪.md",
  关系线: "台账/关系线.md",
  属性变更: "台账/属性变更.md",
  队伍状态: "台账/队伍状态.md",
  物品台账: "台账/物品台账.md",
  承诺台账: "台账/承诺台账.md",
}

/** 智能体派活的归档位置（讨论区，只可追溯，不作依据）。 */
export const 派活归档 = "讨论/智能体派活.md"

/** 稳定设定的分类目录，与「设定」下的一级目录一一对应。 */
export const 设定分类 = ["人物", "地点", "物品", "势力", "制度", "事件", "规则", "备注"]

const 数字汉字 = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

export function 转中文数(数: number): string {
  if (数 <= 10) return 数 === 10 ? "十" : 数字汉字[数] ?? String(数)
  if (数 < 20) return "十" + 数字汉字[数 - 10]
  if (数 < 100) return 数字汉字[Math.floor(数 / 10)] + "十" + (数 % 10 ? 数字汉字[数 % 10] : "")
  return String(数)
}

export function 中文转数(文本: string): number | null {
  const 表: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (/^\d+$/.test(文本)) return Number(文本)
  if (文本 === "十") return 10
  const 匹配 = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(文本)
  if (匹配) return (匹配[1] ? 表[匹配[1]] : 1) * 10 + (匹配[2] ? 表[匹配[2]] : 0)
  if (文本.length === 1 && 表[文本] !== undefined) return 表[文本]
  return null
}

/** 卷目录名：第一卷、第二卷…… */
export function 卷目录名(卷号: number): string {
  return "第" + 转中文数(卷号) + "卷"
}

export function 解析卷目录(名称: string): number | null {
  const 匹配 = /^第(.+?)卷$/.exec(名称)
  return 匹配 ? 中文转数(匹配[1]) : null
}

/** 章文件名：第001章 粉丝一百.md（编号即章号，三位对齐） */
export function 章文件名(编号: number, 标题: string): string {
  const 干净 = 标题.replace(/[\\/:*?"<>|]/g, "_").trim()
  return "第" + String(编号).padStart(3, "0") + "章 " + 干净 + ".md"
}

export function 解析章文件名(文件名: string): { 编号: number; 标题: string } | null {
  const 匹配 = /^第(\d{3,4})章[\s　]*(.*)\.md$/.exec(文件名)
  if (!匹配) return null
  return { 编号: Number(匹配[1]), 标题: 匹配[2] || "第" + 匹配[1] + "章" }
}

/** 一本书的清单文件长这样，人可读、可手改。 */
export function 造清单(书名: string, 作者 = ""): string {
  return [
    "格式: " + 格式标识,
    "书名: " + 书名,
    "作者: " + 作者,
    "建立于: " + new Date().toISOString().slice(0, 10),
    "",
  ].join("\n")
}

export function 读清单(内容: string): { 书名: string; 作者: string; 格式: string } {
  const 取 = (键: string) => {
    const 匹配 = new RegExp("^\\s*" + 键 + "\\s*:\\s*(.+)$", "m").exec(内容)
    return 匹配 ? 匹配[1].replace(/^["']|["']$/g, "").trim() : ""
  }
  return { 书名: 取("书名"), 作者: 取("作者"), 格式: 取("格式") }
}
