export class HexError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`HEX baris ${line}: ${message}`)
    this.name = 'HexError'
  }
}

/**
 * Reads Intel HEX text into a flat byte image. Gaps stay 0xFF, like erased flash.
 * Only data (00) and end-of-file (01) matter for AVR images; segment and linear address
 * records are honoured so larger images stay correct. Checksums are verified.
 */
export function parseHex(text: string, size: number): Uint8Array {
  const image = new Uint8Array(size).fill(0xff)
  let base = 0
  let ended = false
  const lines = text.split(/\r?\n/)

  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]!.trim()
    if (raw === '') continue
    const at = n + 1
    if (ended) throw new HexError(at, 'ada data setelah akhir file')
    if (raw[0] !== ':' || raw.length < 11 || raw.length % 2 === 0 || !/^:[0-9a-fA-F]+$/.test(raw)) throw new HexError(at, 'format tidak valid')

    const bytes = new Uint8Array((raw.length - 1) / 2)
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(raw.slice(1 + i * 2, 3 + i * 2), 16)
    const count = bytes[0]!
    if (bytes.length !== count + 5) throw new HexError(at, 'panjang data tidak cocok')
    if (bytes.reduce((a, b) => (a + b) & 0xff, 0) !== 0) throw new HexError(at, 'checksum salah')

    const address = (bytes[1]! << 8) | bytes[2]!
    const type = bytes[3]!
    const data = bytes.subarray(4, 4 + count)
    if (type === 0x00) {
      const start = base + address
      if (start + count > size) throw new HexError(at, 'melebihi ukuran flash')
      image.set(data, start)
    } else if (type === 0x01) {
      ended = true
    } else if (type === 0x02 && count === 2) {
      base = ((data[0]! << 8) | data[1]!) << 4
    } else if (type === 0x04 && count === 2) {
      base = ((data[0]! << 8) | data[1]!) * 0x10000
    }
  }

  if (!ended) throw new HexError(lines.length, 'tidak ada penutup file')
  return image
}
