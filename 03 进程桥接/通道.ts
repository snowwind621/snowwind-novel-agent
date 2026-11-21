// 唯一契约：主进程与界面之间所有通道名与数据结构。
// 只允许在此文件定义通道；任何一方新增能力都要先改这里。

export const 通道 = {
  打开项目: "项目/打开",
  当前项目: "项目/当前",
  读取章节: "章节/读取",
  保存章节: "章节/保存",
  读取看板: "看板/读取",
  台账同步: "台账/同步",
  台账自动状态: "台账/自动状态",
  台账一致性: "台账/一致性检查",
  台账补齐: "台账/一致性补齐",
  台账立即同步: "台账/立即同步",
  集群成员: "集群/成员",
  集群派活: "集群/派活",
  集群新建: "集群/新建",
  集群删除: "集群/删除",
  集群改: "集群/改",
  续写: "ai/续写",
  改写: "ai/改写",
  导出: "导出/执行",
  书库导入: "书库/导入",
  书库查知情: "书库/查知情",
  书库文件树: "书库/文件树",
  书库读文件: "书库/读文件",
  书库写文件: "书库/写文件",
  书库Git状态: "书库/Git状态",
  书库初始化Git: "书库/初始化Git",
  书架: "书架/读取",
  书架移除: "书架/移除",
  模型清单: "模型/清单",
  读取设置: "设置/读取",
  保存设置: "设置/保存",
  发送对话: "ai/对话",
  中止对话: "ai/中止",
} as const

export const 推送事件 = {
  对话增量: "ai/增量",
  派活进度: "集群/进度",
  /** 台账自动同步的进度：{ 章号, 阶段, 说明, 用量? } */
  自动同步进度: "台账/自动进度",
  /** 一致性检查结果变了：{ 问题数, 可补齐, 需裁定 } */
  一致性变化: "台账/一致性",
} as const

/** 一致性检查的一条问题（跨台账对不上）。 */
export interface 一致性问题 {
  规则: string
  /** 提示 = 半成品里的正常情况（计划中的章），不计入错误数 */
  级别: "可补齐" | "需裁定" | "提示"
  册: string
  章号?: number
  说明: string
  候选?: Array<{ 目标: string; 行?: string }>
  键?: string
}

export interface 补齐结果 {
  成功: boolean
  改动: string[]
  说明: string
  需要确认?: boolean
  问题们?: 一致性问题[]
}

/** 空闲自动同步的进度事件。 */
export interface 自动同步推进 {
  章号: number
  阶段: "开始" | "完成" | "失败"
  说明: string
  /** 网关没回传用量时只有估算值，见 09 台账同步/自动同步.ts 的注释 */
  用量?: { 输入?: number; 输出?: number; 估算词元?: number } | null
}

/** 一次请求的用量。网关不给就整块没有，界面显示「—」，绝不瞎算。 */
export interface 用量 {
  输入: number
  输出: number
  总计: number
  /** 缓存命中；网关没这个字段就是 null */
  缓存命中: number | null
  /** 缓存未命中；能由「输入 - 命中」推出来才算，推不出就是 null */
  缓存未命中: number | null
}

/** 对话流的增量类型。「用量」「工具」的文本都是一段 JSON。 */
export type 对话事件类型 = "思考" | "正文" | "结束" | "错误" | "用量" | "工具" | "提问" | "计划"

/** 总控的三种模式：对话=普通问答；讨论=只读，不写文件；计划=先出计划表，确认后才执行。 */
export type 对话模式 = "对话" | "讨论" | "计划"

/** 一次工具调用的回执：界面上显示成一条中间消息（谁、参数、结果多长）。 */
export interface 工具回执 {
  名称: string
  中文名: string
  参数: Record<string, unknown>
  状态: "开始" | "完成" | "失败" | "待确认"
  /** 第几轮工具循环（从 1 开始，最多 4 轮） */
  轮次: number
  结果字数?: number
  /** 一句话摘要；失败/待确认时是要给用户看的原因 */
  摘要?: string
}

export interface 书架项 {
  路径: string
  书名: string
  最后打开: string
}

export interface 改写请求 {
  请求号: string
  模型: string
  章节号: number
  标题: string
  原文: string
  前文: string
  后文: string
  指令: string
}

export interface 续写请求 {
  请求号: string
  模型: string
  章节号: number
  标题: string
  已有正文: string
  指令?: string
}

export interface 派活进度 {
  任务号: string
  成员: string
  角色: string
  阶段: "开始" | "完成"
  完成数: number
  总数: number
}

export interface 章节摘要 {
  编号: number
  标题: string
  文件: string
  字数: number
}

export interface 卷组 {
  编号: number
  章节: 章节摘要[]
}

export interface 项目摘要 {
  路径: string
  书名: string
  卷: 卷组[]
  统计: { 章数: number; 总字数: number; 最新章节: number }
}

export interface 伏笔项 {
  编号: string
  名称: string
  埋章: number | null
  兑章: number[]
  兑了什么: string
  参考间隔: number | null
  重要程度: string
  意图: string
  状态: "待兑现" | "已兑现" | "未记埋"
  预定章: number[]
  搁置章数: number
  超期: boolean
  久置: boolean
}

export interface 台账卡 {
  名称: string
  相对路径: string
  行数: number
  摘录: string
}

export interface 待裁定条目 {
  提者: string
  角色: string
  内容: string
  依据: string
  状态: string
}

export interface 待裁定章 {
  章号: number
  标题: string
  条目: 待裁定条目[]
}

export interface 看板数据 {
  最新章节: number
  伏笔: 伏笔项[]
  统计: { 总数: number; 已兑现: number; 待兑现: number; 超期: number; 久置: number }
  台账: 台账卡[]
  待裁定?: 待裁定章[]
}

export interface 外观设置 {
  /** 暗 / 亮 / 跟随系统（跟随系统时按 matchMedia 解析成暗或亮） */
  主题: "米黄" | "暗" | "亮" | "跟随系统"
  /** 界面基准字号，px */
  界面字号: number
  编辑器字体: "宋体" | "黑体" | "系统"
  /** 正文字号，px */
  编辑器字号: number
  /** 正文行距（倍数） */
  行距: number
  /** 整界面缩放，1 = 原始 */
  界面缩放: number
  /** 正文行宽：窄 / 中 / 宽 */
  行宽: "窄" | "中" | "宽"
  /** 卡片与气泡圆角，px */
  圆角: number
  /** 减少动态效果：关掉过渡与动画 */
  减少动态: boolean
}

export interface 编辑器设置 {
  默认模式: "源码" | "分屏" | "预览"
  /** 0 = 关掉自动保存 */
  自动保存秒: number
  显示字数: boolean
  /** 自动保存时顺手做一次 Git 提交 */
  自动Git: boolean
  /** 撤回栈深度（步） */
  撤回栈深度: number
}

export interface 模型设置 {
  网关地址: string
  API密钥: string
  分工: { 总编: string; 执笔: string; 审校: string; 助手: string }
  超时秒: number
  重试次数: number
  重试间隔秒: number
  温度: number
  最大输出词元: number
  /** 一次请求失败后，自动换下一个分工模型重试 */
  失败换模型: boolean
  /** 单轮最多跑几个工具回合 */
  最大工具轮: number
}

export interface 上下文设置 {
  单卡注入字数: number
  历史保留条数: number
  /** 0.3 ~ 1：上下文用到这个比例就开始压缩 */
  压缩触发比例: number
  压缩后保留条数: number
  /** 压摘要用哪个分工（留空 = 助手） */
  摘要模型: string
  /** 把上一章结尾注入提示 */
  注入上章结尾: boolean
  /** 上一章结尾注入多少字 */
  注入上章字数: number
}

export interface 技能项 {
  名称: string
  内容: string
  默认附加: boolean
}

export interface 智能体设置 {
  并发数: number
  阵容上限: number
  /** 讨论模式默认拉几个人（2–8） */
  讨论人数: number
  /** 计划模式里作者要说的确认词（默认「确认」） */
  计划确认词: string
  /** 讨论模式允许的工具（逗号分隔的工具名；留空用内置白名单） */
  只读工具: string
  /** 思考强度：传给网关的 reasoning_effort，网关不认就静默去掉 */
  思考强度: "低" | "中" | "高"
  /** 对话与工具轮共用的单轮输出上限 */
  每轮最大输出词元: number
  /** 工具轮上限（1–20）；旧字段 模型.最大工具轮 继续兼容 */
  工具轮上限: number
  /** 对话温度（续写/改写仍走模型组） */
  对话温度: number
  /** 自动查证：关掉后提示词不写「先查后说」 */
  自动查证: boolean
  人格: { 总编: string; 审校: string; 伏笔: string; 台账: string; 地点: string; 物品: string }
  技能: 技能项[]
}

export interface 书库设置 {
  上次路径: string
  /** 校验器默认是否附带「修复建议」 */
  校验修复建议: boolean
  /** 导出默认格式 */
  导出格式: "docx" | "markdown" | "epub"
}

/** 台账自动同步：停手后才跑，不跟保存跑。 */
export interface 台账设置 {
  /** 总开关；关掉后连标记都不记（手动「立即同步」仍可用） */
  自动同步: boolean
  /** 停手多少秒后开跑（5–120） */
  静置秒: number
  /** 失败后自动再试几次（0–2），用完就停在失败状态等手动重试 */
  失败重试次数: number
}

export interface 设置 {
  版本: 1
  外观: 外观设置
  编辑器: 编辑器设置
  模型: 模型设置
  上下文: 上下文设置
  智能体: 智能体设置
  台账: 台账设置
  书库: 书库设置
}

/** 书库里的一个条目：目录带 子，文件带 大小。 */
export interface 文件节点 {
  名称: string
  相对路径: string
  是目录: boolean
  大小: number
  子?: 文件节点[]
}

export interface 文件树结果 {
  树: 文件节点[]
  截断: boolean
}

export interface 文件内容 {
  相对路径: string
  文本: string
  大小: number
  是文本: boolean
}

export interface 对话请求 {
  请求号: string
  模型: string
  系统提示: string
  用户输入: string
  /** 缺省按「对话」处理 */
  模式?: 对话模式
  /** 覆盖设置里的温度（压缩摘要要 0）；不给就用设置里的值 */
  温度?: number
}