// 只负责一件事：把主进程能力以「桥」的名字暴露给界面，别的一概不给。
import { contextBridge, ipcRenderer } from "electron"
import { 通道, 推送事件 } from "../03 进程桥接/通道"

contextBridge.exposeInMainWorld("桥", {
  打开项目: (路径: string) => ipcRenderer.invoke(通道.打开项目, 路径),
  当前项目: () => ipcRenderer.invoke(通道.当前项目),
  读取章节: (编号: number) => ipcRenderer.invoke(通道.读取章节, 编号),
  保存章节: (编号: number, 正文: string) => ipcRenderer.invoke(通道.保存章节, 编号, 正文),
  读取看板: () => ipcRenderer.invoke(通道.读取看板),
  台账同步: (章节号: number) => ipcRenderer.invoke(通道.台账同步, 章节号),
  集群成员: () => ipcRenderer.invoke(通道.集群成员),
  新建成员: (名称: string, 职责: string, 管辖文本: string) =>
    ipcRenderer.invoke(通道.集群新建, 名称, 职责, 管辖文本),
  派活: (任务: string, 章节号: number) => ipcRenderer.invoke(通道.集群派活, 任务, 章节号),
  删除成员: (id: string) => ipcRenderer.invoke(通道.集群删除, id),
  改成员: (id: string, 名称: string, 职责: string, 管辖文本: string) =>
    ipcRenderer.invoke(通道.集群改, id, 名称, 职责, 管辖文本),
  续写: (请求: unknown) => ipcRenderer.invoke(通道.续写, 请求),
  改写: (请求: unknown) => ipcRenderer.invoke(通道.改写, 请求),
  导出: (格式: string) => ipcRenderer.invoke(通道.导出, 格式),
  导入旧书库: (旧根: string, 新根: string) => ipcRenderer.invoke(通道.书库导入, 旧根, 新根),
  书架: () => ipcRenderer.invoke(通道.书架),
  移出书架: (路径: string) => ipcRenderer.invoke(通道.书架移除, 路径),
  监听派活: (回调: (事件: unknown) => void) => {
    const 处理 = (_事件: unknown, 载荷: unknown) => 回调(载荷)
    ipcRenderer.on(推送事件.派活进度, 处理 as any)
    return () => ipcRenderer.off(推送事件.派活进度, 处理 as any)
  },
  模型清单: () => ipcRenderer.invoke(通道.模型清单),
  读取设置: () => ipcRenderer.invoke(通道.读取设置),
  保存设置: (设置: unknown) => ipcRenderer.invoke(通道.保存设置, 设置),
  发送对话: (请求: unknown) => ipcRenderer.invoke(通道.发送对话, 请求),
  中止对话: (请求号: string) => ipcRenderer.invoke(通道.中止对话, 请求号),
  监听对话: (回调: (事件: unknown) => void) => {
    const 处理 = (_事件: unknown, 载荷: unknown) => 回调(载荷)
    ipcRenderer.on(推送事件.对话增量, 处理 as any)
    return () => ipcRenderer.off(推送事件.对话增量, 处理 as any)
  },
})
