// 唯一契约：主进程与界面之间所有通道名与数据结构。
// 只允许在此文件定义通道；任何一方新增能力都要先改这里。

export const 通道 = {
  打开项目: "项目/打开",
  当前项目: "项目/当前",
  读取章节: "章节/读取",
  保存章节: "章节/保存",
  读取看板: "看板/读取",
  台账同步: "台账/同步",
  集群成员: "集群/成员",
  集群派活: "集群/派活",
  集群新建: "集群/新建",
  集群删除: "集群/删除",
  集群改: "集群/改",
  续写: "ai/续写",
  导出: "导出/执行",
  模型清单: "模型/清单",
  读取设置: "设置/读取",
  保存设置: "设置/保存",
  发送对话: "ai/对话",
  中止对话: "ai/中止",
} as const

export const 推送事件 = {
  对话增量: "ai/增量",
  派活进度: "集群/进度",
} as const

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

export interface 看板数据 {
  最新章节: number
  伏笔: 伏笔项[]
  统计: { 总数: number; 已兑现: number; 待兑现: number; 超期: number; 久置: number }
  台账: 台账卡[]
}

export interface 设置 {
  网关地址: string
  API密钥: string
  分工: { 总编: string; 执笔: string; 审校: string; 助手: string }
  项目路径: string
}

export interface 对话请求 {
  请求号: string
  模型: string
  系统提示: string
  用户输入: string
}
