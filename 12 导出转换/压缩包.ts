// 只负责一件事：把若干命名文件打成一个标准 ZIP（不压缩，够用且零依赖）。
export interface 条目 {
  名称: string
  数据: Buffer
}

const CRC表 = (() => {
  const 表 = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    表[i] = c
  }
  return 表
})()

function crc32(数据: Buffer): number {
  let c = -1
  for (let i = 0; i < 数据.length; i++) c = CRC表[(c ^ 数据[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function 时戳(): { 日期: number; 时间: number } {
  const d = new Date()
  return {
    日期: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    时间: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  }
}

export function 打ZIP(条目们: 条目[]): Buffer {
  const 局部: Buffer[] = []
  const 中央: Buffer[] = []
  let 偏移 = 0
  const { 日期, 时间 } = 时戳()

  for (const 条目 of 条目们) {
    const 名 = Buffer.from(条目.名称, "utf8")
    const 数据 = 条目.数据
    const 校验 = crc32(数据)

    const 头 = Buffer.alloc(30)
    头.writeUInt32LE(0x04034b50, 0)
    头.writeUInt16LE(20, 4)
    头.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    头.writeUInt16LE(0, 8) // 存储，不压缩
    头.writeUInt16LE(时间, 10)
    头.writeUInt16LE(日期, 12)
    头.writeUInt32LE(校验, 14)
    头.writeUInt32LE(数据.length, 18)
    头.writeUInt32LE(数据.length, 22)
    头.writeUInt16LE(名.length, 26)
    头.writeUInt16LE(0, 28)
    局部.push(头, 名, 数据)

    const 中 = Buffer.alloc(46)
    中.writeUInt32LE(0x02014b50, 0)
    中.writeUInt16LE(20, 4)
    中.writeUInt16LE(20, 6)
    中.writeUInt16LE(0x0800, 8)
    中.writeUInt16LE(0, 10)
    中.writeUInt16LE(时间, 12)
    中.writeUInt16LE(日期, 14)
    中.writeUInt32LE(校验, 16)
    中.writeUInt32LE(数据.length, 20)
    中.writeUInt32LE(数据.length, 24)
    中.writeUInt16LE(名.length, 28)
    中.writeUInt16LE(0, 30)
    中.writeUInt16LE(0, 32)
    中.writeUInt16LE(0, 34)
    中.writeUInt16LE(0, 36)
    中.writeUInt32LE(0, 38)
    中.writeUInt32LE(偏移, 42)
    中央.push(中, 名)

    偏移 += 30 + 名.length + 数据.length
  }

  const 中央区 = Buffer.concat(中央)
  const 结束 = Buffer.alloc(22)
  结束.writeUInt32LE(0x06054b50, 0)
  结束.writeUInt16LE(0, 4)
  结束.writeUInt16LE(0, 6)
  结束.writeUInt16LE(条目们.length, 8)
  结束.writeUInt16LE(条目们.length, 10)
  结束.writeUInt32LE(中央区.length, 12)
  结束.writeUInt32LE(偏移, 16)
  结束.writeUInt16LE(0, 20)

  return Buffer.concat([...局部, 中央区, 结束])
}
