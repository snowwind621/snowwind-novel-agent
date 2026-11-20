// 只负责一件事：把「埋 → 兑」算成伏笔状态机，并判断谁超期、谁搁置太久。
import type { 伏笔项 } from "../03 进程桥接/通道"
import type { 承诺行 } from "../10 书库检索/台账解析"
import { 取首个章号, 取全部章号 } from "../10 书库检索/台账解析"

/** 没有参考间隔时，埋下超过这么多章还没兑现，就按「搁置太久」提醒。 */
export const 搁置阈值 = 15

function 是否未落定(小节: string): boolean {
  return 小节.includes("未落定") || 小节.includes("待定") || 小节.includes("计划")
}

/** 参考间隔与重要程度、意图都来自承诺台账的列：台账是正本，不依赖任何外部镜像文件。 */
export function 合并伏笔(承诺: 承诺行[], 最新章节: number): 伏笔项[] {
  const 出: 伏笔项[] = []
  const 已见 = new Set<string>()
  for (const 行 of 承诺) {
    if (已见.has(行.编号)) continue
    已见.add(行.编号)

    const 埋章 = 取首个章号(行.埋)
    const 全部兑章号 = 取全部章号(行.兑)
    const 未落定 = 是否未落定(行.小节)
    const 兑章 = 未落定 ? [] : 全部兑章号
    const 预定章 = 未落定 ? 全部兑章号 : []
    const 间隔 = 行.参考间隔

    const 状态: 伏笔项["状态"] = 兑章.length > 0 ? "已兑现" : 埋章 === null ? "未记埋" : "待兑现"
    const 搁置章数 = 埋章 === null ? 0 : Math.max(0, 最新章节 - 埋章)
    const 超期 = 状态 === "待兑现" && 间隔 !== null && 搁置章数 > 间隔
    const 久置 = 状态 === "待兑现" && 间隔 === null && 搁置章数 >= 搁置阈值

    出.push({
      编号: 行.编号,
      名称: 行.名称 || "（未命名承诺）",
      埋章,
      兑章,
      预定章,
      兑了什么: 行.备注,
      参考间隔: 间隔,
      重要程度: 行.重要程度,
      意图: 行.意图,
      状态,
      搁置章数,
      超期,
      久置,
    })
  }
  return 出
}

export function 汇总伏笔(伏笔: 伏笔项[]) {
  return {
    总数: 伏笔.length,
    已兑现: 伏笔.filter((x) => x.状态 === "已兑现").length,
    待兑现: 伏笔.filter((x) => x.状态 === "待兑现").length,
    超期: 伏笔.filter((x) => x.超期).length,
    久置: 伏笔.filter((x) => x.久置).length,
  }
}

export function 排序伏笔(伏笔: 伏笔项[]): 伏笔项[] {
  const 权重 = (x: 伏笔项) =>
    x.超期 ? 0 : x.久置 ? 1 : x.状态 === "未记埋" ? 2 : x.状态 === "待兑现" ? 3 : 4
  return [...伏笔].sort((甲, 乙) => {
    const 差 = 权重(甲) - 权重(乙)
    if (差 !== 0) return 差
    return (乙.搁置章数 ?? 0) - (甲.搁置章数 ?? 0)
  })
}
