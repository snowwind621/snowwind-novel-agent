// 只负责一件事：不打开界面，把「读库 → 看板 → 提示词 → 真模型流式」完整跑一遍。
// 网关与密钥不写死在代码里：先读本机设置（%APPDATA%/snowwind-novel-agent/设置.json），也可以用环境变量覆盖。
import path from "node:path"
import { 扫描项目 } from "../../10 书库检索/项目扫描"
import { 装配看板 } from "../../10 书库检索/看板装配"
import { 组装系统提示 } from "../../05 编排内核/章节提示词"
import { 流式对话 } from "../../04 模型接入/网关客户端"
import { 读文本 } from "../../11 文件工作区/原子写"
import { 读设置 } from "../../14 配置密钥/设置存储"

const 书库 = process.argv[2]
const 数据目录 = path.join(process.env.APPDATA ?? "", "snowwind-novel-agent")

async function 主() {
  const 设置 = 读设置(数据目录)
  const 基址 = process.env.网关地址 || 设置.模型.网关地址
  const 密钥 = process.env.网关密钥 || 设置.模型.API密钥
  const 模型 = process.env.网关模型 || 设置.模型.分工.助手
  if (!密钥) throw new Error("没有密钥：请先打开软件在「设置」里填一次，或设置环境变量 网关密钥")

  const 项目 = await 扫描项目(书库)
  const 看板 = await 装配看板(书库, 项目.统计.最新章节)
  const 末章 = 项目.卷.at(-1)?.章节.at(-1)
  const 正文 = await 读文本(path.join(书库, 末章?.文件 ?? ""))

  const 系统提示 = 组装系统提示({
    书名: 项目.书名,
    章节号: 28,
    章节标题: "待写",
    伏笔: 看板.伏笔,
    正文尾部: 正文,
  })

  let 流字数 = 0
  let 首字节毫秒 = 0
  const 起 = Date.now()
  const 全文 = await 流式对话({
    基址,
    密钥,
    模型,
    消息: [
      { role: "system", content: 系统提示 },
      { role: "user", content: "只回三行：1) 这章最该兑现的伏笔编号 2) 理由一句话 3) 一句开场正文（30 字内）" },
    ],
    最大词元: 1200,
    回调: (类型, 文本) => {
      if (类型 === "正文") {
        流字数 += 文本.length
        if (!首字节毫秒) 首字节毫秒 = Date.now() - 起
      }
    },
  })

  console.log(JSON.stringify({
    书名: 项目.书名,
    章数: 项目.统计.章数,
    总字数: 项目.统计.总字数,
    伏笔统计: 看板.统计,
    提示词长度: 系统提示.length,
    流式: { 首字节毫秒, 总毫秒: Date.now() - 起, 正文字数: 流字数 },
    模型回复: 全文.slice(0, 300),
  }, null, 2))
}

主().catch((错误) => {
  console.error("联调失败：", 错误)
  process.exit(1)
})
