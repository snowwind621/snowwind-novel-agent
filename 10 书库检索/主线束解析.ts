// 只负责一件事：把 binder.xml 与章节文件名解析成「卷 → 章」清单。

export interface 卷结构 {
  卷号: number
  章节号: number[]
}

export function 解析主线束(xml: string): 卷结构[] {
  const 结果: 卷结构[] = []
  const 组正则 = /<group\s+id="([^"]+)"\s*>([\s\S]*?)<\/group>/g
  let 组: RegExpExecArray | null
  while ((组 = 组正则.exec(xml)) !== null) {
    const 卷号 = Number(组[1])
    const 章节号: number[] = []
    const 章正则 = /<chapter\s+id="([^"]+)"\s*\/?>/g
    let 章匹配: RegExpExecArray | null
    while ((章匹配 = 章正则.exec(组[2])) !== null) 章节号.push(Number(章匹配[1]))
    结果.push({ 卷号, 章节号 })
  }
  return 结果
}

export interface 章文件 {
  编号: number
  标题: string
  文件名: string
}

export function 解析章文件名(文件名: string): 章文件 | null {
  const 匹配 = /^(\d{4,5})-(.+)\.md$/.exec(文件名)
  if (!匹配) return null
  return { 编号: Number(匹配[1]), 标题: 匹配[2], 文件名 }
}
