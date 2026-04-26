// ============================================================
// PropFS — Formatter Utilities
// ============================================================

/**
 * Format angka ke Rupiah — SELALU menampilkan nominal penuh
 * @param value  nilai dalam Rupiah
 * @param _short (deprecated, tidak digunakan lagi — selalu nominal penuh)
 */
export function formatRupiah(value: number, _short = false): string {
  if (isNaN(value) || !isFinite(value)) return 'Rp —'
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`
}

/**
 * Format Rupiah KHUSUS untuk label sumbu chart (Y-axis)
 * — menggunakan singkatan agar tidak terlalu panjang di chart
 */
export function formatRupiahAxis(value: number): string {
  if (isNaN(value) || !isFinite(value)) return 'Rp —'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `${sign}${(abs / 1e9).toFixed(1)}M`
  if (abs >= 1e6)  return `${sign}${(abs / 1e6).toFixed(0)}Jt`
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`
}

/**
 * @deprecated Gunakan formatRupiahAxis untuk chart axis
 */
export function formatRupiahCompact(value: number): string {
  return formatRupiahAxis(value)
}

/**
 * Format angka ke persentase
 */
export function formatPct(value: number, decimals = 1): string {
  if (isNaN(value) || !isFinite(value)) return '—%'
  return `${value.toFixed(decimals)}%`
}

/**
 * Format angka dengan separator ribuan ID
 */
export function formatNumber(value: number): string {
  if (isNaN(value) || !isFinite(value)) return '—'
  return value.toLocaleString('id-ID')
}

/**
 * Format area m²
 */
export function formatM2(value: number): string {
  return `${formatNumber(value)} m²`
}

/**
 * Parse string Rupiah kembali ke number
 * Handles "1.000.000" → 1000000
 */
export function parseRupiah(str: string): number {
  if (!str) return 0
  // Remove "Rp", spaces, dots, then replace comma with dot for decimal
  const cleaned = str
    .replace(/Rp\s*/i, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

/**
 * Format input angka ke format Indonesia saat diketik
 * (digunakan di controlled inputs)
 */
export function formatInputNumber(value: number | string): string {
  if (value === '' || value === undefined || value === null) return ''
  const num = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value
  if (isNaN(num)) return ''
  return num.toLocaleString('id-ID')
}

/**
 * Sanitize input numeric string → number
 */
export function sanitizeNumber(raw: string): number {
  if (!raw) return 0
  // Remove thousand separators (.) then parse
  const cleaned = raw.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

/**
 * Label singkat untuk status kelayakan
 */
export function formatStatus(status: string): string {
  switch (status) {
    case 'sangat_layak': return '✓ SANGAT LAYAK'
    case 'layak':        return '✓ LAYAK'
    case 'tidak_layak':  return '✗ TIDAK LAYAK'
    default:             return status
  }
}

/**
 * Warna CSS untuk status
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'sangat_layak': return 'text-green-700 bg-green-50 border-green-200'
    case 'layak':        return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'tidak_layak':  return 'text-red-700 bg-red-50 border-red-200'
    default:             return 'text-gray-700 bg-gray-50 border-gray-200'
  }
}

/**
 * Warna hex untuk chart berdasarkan status
 */
export function getStatusHex(status: string): string {
  switch (status) {
    case 'sangat_layak': return '#1B5E20'
    case 'layak':        return '#E65100'
    case 'tidak_layak':  return '#B71C1C'
    default:             return '#555'
  }
}

/**
 * Warna grafik fase
 */
export const CHART_COLORS = [
  '#0D47A1',
  '#C9A84C',
  '#1B5E20',
  '#B71C1C',
  '#6A1B9A',
  '#00695C',
]

export const FASE_COLORS = ['#0D47A1', '#C9A84C', '#1B5E20']
