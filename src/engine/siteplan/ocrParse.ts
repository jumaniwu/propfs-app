/**
 * Parser teks hasil OCR dokumen koordinat (Surat Ukur / daftar koordinat).
 * Murni (tanpa DOM) sehingga bisa diuji langsung di Node.
 */
import type { Point } from './geometry.ts'

export interface OcrParseResult {
  points: Point[]
  /** Offset yang dikurangkan bila koordinat berskala UTM/TM3 (>10.000 m). */
  offset: { x: number; y: number } | null
}

/**
 * Ekstrak pasangan koordinat dari teks hasil OCR.
 * - Toleran pemisah ribuan gaya Indonesia (698.450,25) dan internasional (698,450.25)
 * - Format tabel Surat Ukur "No | X | Y" (angka pertama = nomor urut) dikenali
 * - Salah baca umum O→0, l/I→1 dikoreksi
 * - Koordinat skala UTM/TM3 dinormalisasi ke meter lokal
 */
export function parseOcrCoords(text: string): OcrParseResult {
  let rawPairs: Point[] = []
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    // koreksi salah baca umum di sekitar digit; ulang sampai stabil
    let line = rawLine
    let prev: string
    do {
      prev = line
      line = line
        .replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0')
        .replace(/[lI](?=\d)|(?<=\d)[lI]/g, '1')
    } while (line !== prev)

    const nums = extractNumbers(line)
    if (nums.length < 2) continue
    let x: number
    let y: number
    if (nums.length >= 3 && looksLikeIndex(nums[0], rawPairs.length)) {
      x = nums[1]
      y = nums[2]
    } else {
      x = nums[0]
      y = nums[1]
    }
    if (isFinite(x) && isFinite(y)) rawPairs.push([x, y])
  }

  // normalisasi skala UTM/TM3 → meter lokal
  let offset: OcrParseResult['offset'] = null
  if (rawPairs.length) {
    let minX = Infinity
    let minY = Infinity
    let maxAbs = 0
    for (const p of rawPairs) {
      minX = Math.min(minX, p[0])
      minY = Math.min(minY, p[1])
      maxAbs = Math.max(maxAbs, Math.abs(p[0]), Math.abs(p[1]))
    }
    if (maxAbs > 10000) {
      offset = { x: minX, y: minY }
      rawPairs = rawPairs.map(p => [+(p[0] - minX).toFixed(3), +(p[1] - minY).toFixed(3)])
    }
  }
  return { points: rawPairs, offset }
}

function looksLikeIndex(n: number, expectedIdx: number): boolean {
  // nomor urut: bilangan bulat kecil, idealnya berurutan
  return Number.isInteger(n) && n >= 0 && n < 1000 &&
    (expectedIdx === 0 || Math.abs(n - (expectedIdx + 1)) <= 2)
}

function extractNumbers(line: string): number[] {
  // 1) kolom dipisah spasi/;/| — format tabel umum
  let nums = numsFromFields(line.split(/[\s;|]+/))
  if (nums.length >= 2) return nums
  // 2) koma sebagai pemisah kolom ("120,0" atau CSV "1,10,20")
  nums = numsFromFields(line.split(','))
  if (nums.length >= 2) return nums
  return []
}

function numsFromFields(fields: string[]): number[] {
  const out: number[] = []
  for (const f of fields) {
    const m = f.match(/-?\d[\d.,]*/)
    if (!m) continue
    const v = parseNumberToken(m[0])
    if (v !== null) out.push(v)
  }
  return out
}

function parseNumberToken(rawTok: string): number | null {
  const tok = rawTok.replace(/[.,]+$/, '') // buang tanda baca akhir kalimat
  if (!tok || tok === '-') return null
  const hasDot = tok.includes('.')
  const hasComma = tok.includes(',')
  let v: number
  if (hasDot && hasComma) {
    // pemisah terakhir = desimal
    if (tok.lastIndexOf(',') > tok.lastIndexOf('.')) {
      v = parseFloat(tok.replace(/\./g, '').replace(',', '.')) // gaya Indonesia
    } else {
      v = parseFloat(tok.replace(/,/g, '')) // gaya internasional
    }
  } else if (hasComma) {
    // koma tunggal dengan ≤2 digit di belakang = desimal
    const parts = tok.split(',')
    if (parts.length === 2 && parts[1].length !== 3) {
      v = parseFloat(tok.replace(',', '.'))
    } else if (parts.slice(1).every(p => p.length === 3)) {
      v = parseFloat(tok.replace(/,/g, ''))
    } else {
      v = parseFloat(tok.replace(',', '.'))
    }
  } else if (hasDot) {
    const dparts = tok.split('.')
    if (dparts.length === 2 && dparts[1].length !== 3) {
      v = parseFloat(tok) // desimal biasa
    } else if (dparts.slice(1).every(p => p.length === 3)) {
      v = parseFloat(tok.replace(/\./g, '')) // ribuan gaya Indonesia
    } else {
      v = parseFloat(tok)
    }
  } else {
    v = parseFloat(tok)
  }
  return isFinite(v) ? v : null
}

/** Parser input textarea koordinat manual (toleran `x,y` / `x y` / `x;y`). */
export function parseManualCoords(text: string): { points: Point[]; errors: string[] } {
  const points: Point[] = []
  const errors: string[] = []
  const lines = text.split(/\n+/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(/[,;\t]+|\s+/).filter(Boolean)
    if (parts.length < 2) {
      errors.push(`Baris ${i + 1}: "${line}" bukan pasangan angka.`)
      continue
    }
    const x = parseFloat(parts[0])
    const y = parseFloat(parts[1])
    if (!isFinite(x) || !isFinite(y)) {
      errors.push(`Baris ${i + 1}: "${line}" bukan angka valid.`)
      continue
    }
    points.push([x, y])
  }
  return { points, errors }
}
