// 只负责一件事：按行修改 Markdown 表格——追加、替换、定位，都不重排原格式。
export interface 表位置 {
  表头行: number
  首行: number
  末行: number
  表头: string[]
}

function 拆格(行: string): string[] {
  return 行.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim())
}

function 装格(值: string[]): string {
  return "| " + 值.join(" | ") + " |"
}

/** 找到表头同时包含全部关键字的那张表。 */
export function 找表(行们: string[], 关键字: string[]): 表位置 | null {
  for (let i = 0; i < 行们.length; i++) {
    const 行 = 行们[i].trim()
    if (!行.startsWith("|")) continue
    const 表头 = 拆格(行)
    if (!关键字.every((词) => 表头.some((列) => 列.includes(词)))) continue
    const 分隔 = (行们[i + 1] ?? "").trim()
    if (!/^\|[\s:\-|]+\|$/.test(分隔)) continue
    let 末行 = i + 2
    while (末行 < 行们.length && 行们[末行].trim().startsWith("|")) 末行++
    return { 表头行: i, 首行: i + 2, 末行: 末行 - 1, 表头 }
  }
  return null
}

/** 找出所有满足关键字条件的表（承诺台账里同一编号可能落在不同小节）。 */
export function 找表们(行们: string[], 关键字: string[]): 表位置[] {
  const 结果: 表位置[] = []
  let 起点 = 0
  for (;;) {
    const 表 = 找表(行们.slice(起点), 关键字)
    if (!表) break
    结果.push({
      ...表,
      表头行: 表.表头行 + 起点,
      首行: 表.首行 + 起点,
      末行: 表.末行 + 起点,
    })
    起点 += 表.末行 + 1
  }
  return 结果
}

export function 列号(表: 表位置, 名称: string): number {
  return 表.表头.findIndex((列) => 列.includes(名称))
}

/** 在表尾追加一行，列数不足补空，超出截断。 */
export function 追加行(行们: string[], 表: 表位置, 值: string[]): void {
  const 补全 = 表.表头.map((_, 序) => 值[序] ?? "")
  行们.splice(表.末行 + 1, 0, 装格(补全))
}

/** 找到某列取值满足条件的行；返回行号（无则 -1）。 */
export function 找行(行们: string[], 表: 表位置, 列: number, 判定: (值: string) => boolean): number {
  for (let 序 = 表.首行; 序 <= 表.末行; 序++) {
    const 格们 = 拆格(行们[序])
    if (判定((格们[列] ?? "").trim())) return 序
  }
  return -1
}

export function 取行(行们: string[], 序: number): string[] {
  return 拆格(行们[序])
}

export function 写行(行们: string[], 序: number, 值: string[]): void {
  行们[序] = 装格(值)
}

export function 删行(行们: string[], 序: number): void {
  行们.splice(序, 1)
}
