// ============================================================
// PropFS — Penerimaan barang (DO) & pembayaran PO (logika murni)
//
// Menjawab tiga pertanyaan yang selama ini tidak terjawab setelah PO dikirim:
//   1. Barangnya sudah datang belum, dan berapa yang masih kurang?
//   2. PO mana yang sudah dibayar, sebagian, atau belum sama sekali?
//   3. Mana yang jatuh temponya sudah lewat?
//
// Jatuh tempo dihitung dari TANGGAL NOTA vendor, bukan tanggal PO maupun
// tanggal barang diterima — itulah tanggal tagihan resminya. Bila satu PO
// punya beberapa nota, yang dipakai adalah nota PALING AWAL, supaya PO
// tertandai terlambat begitu tagihan pertamanya lewat tempo.
//
// Tanpa DOM & tanpa impor runtime, supaya bisa diuji langsung di Node.
// ============================================================

import type { PurchaseOrder, PoItem } from './procurement'

// ── Bentuk data ─────────────────────────────────────────────────────────────

export interface DoItem {
  nama: string
  satuan: string
  /** Qty yang BENAR-BENAR datang, bukan yang dipesan. */
  qty: number
}

export interface DeliveryOrder {
  id: string
  po_id: string
  nomor_do: string
  nomor_nota: string
  /** YYYY-MM-DD. Dasar jatuh tempo; kosong bila vendor belum menyerahkan nota. */
  tanggal_nota: string | null
  tanggal_terima: string
  penerima: string
  items: DoItem[]
  catatan: string
  foto: string[]
  created_at?: string
}

export type MetodeBayar = 'transfer' | 'tunai' | 'giro' | 'lainnya'

export const LABEL_METODE: Record<MetodeBayar, string> = {
  transfer: 'Transfer',
  tunai: 'Tunai',
  giro: 'Giro / Cek',
  lainnya: 'Lainnya',
}

export interface PoPayment {
  id: string
  po_id: string
  tanggal: string
  jumlah: number
  metode: MetodeBayar
  referensi: string
  bukti: string | null
  catatan: string
  created_at?: string
}

// ── Penerimaan barang ───────────────────────────────────────────────────────

export type StatusTerima = 'belum' | 'sebagian' | 'lengkap'

export const LABEL_STATUS_TERIMA: Record<StatusTerima, string> = {
  belum: 'Belum Datang',
  sebagian: 'Datang Sebagian',
  lengkap: 'Lengkap',
}

export const TONE_STATUS_TERIMA: Record<StatusTerima, string> = {
  belum: 'bg-slate-100 text-slate-600',
  sebagian: 'bg-amber-100 text-amber-800',
  lengkap: 'bg-emerald-100 text-emerald-800',
}

/**
 * Nama barang disamakan sebelum dibandingkan. Nama pada DO diketik ulang atau
 * dibaca AI dari nota, jadi hampir tidak pernah sama persis dengan PO.
 */
function kunciNama(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

const angka = (n: unknown): number => {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

export interface BarisTerima {
  nama: string
  satuan: string
  dipesan: number
  diterima: number
  /** Tidak pernah negatif; kelebihan kirim tidak menghasilkan sisa minus. */
  kurang: number
}

/** Rincian per barang: dipesan berapa, sudah datang berapa, kurang berapa. */
export function ringkasTerima(
  items: PoItem[] | null | undefined,
  dos: DeliveryOrder[] | null | undefined,
): BarisTerima[] {
  const datang = new Map<string, number>()
  for (const d of dos ?? []) {
    for (const it of d?.items ?? []) {
      const k = kunciNama(it?.nama)
      if (!k) continue
      datang.set(k, (datang.get(k) ?? 0) + Math.max(0, angka(it.qty)))
    }
  }
  return (items ?? []).map(it => {
    const dipesan = Math.max(0, angka(it.qty))
    const diterima = datang.get(kunciNama(it.nama)) ?? 0
    return {
      nama: it.nama, satuan: it.satuan,
      dipesan, diterima,
      kurang: Math.max(0, dipesan - diterima),
    }
  })
}

/** Status penerimaan sebuah PO secara keseluruhan. */
export function statusTerima(
  items: PoItem[] | null | undefined,
  dos: DeliveryOrder[] | null | undefined,
): StatusTerima {
  const baris = ringkasTerima(items, dos)
  // PO tanpa barang tidak pernah dianggap "lengkap" — tidak ada yang diterima.
  if (baris.length === 0) return 'belum'
  const adaYangDatang = baris.some(b => b.diterima > 0)
  const masihKurang = baris.some(b => b.kurang > 0)
  if (!adaYangDatang) return 'belum'
  return masihKurang ? 'sebagian' : 'lengkap'
}

/** DO milik sebuah PO saja. */
export function doMilikPo(poId: string, dos: DeliveryOrder[] | null | undefined): DeliveryOrder[] {
  if (!poId) return []
  return (dos ?? []).filter(d => d?.po_id === poId)
}

// ── Pembayaran ──────────────────────────────────────────────────────────────

export type StatusBayar = 'belum' | 'sebagian' | 'lunas'

export const LABEL_STATUS_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum Dibayar',
  sebagian: 'Dibayar Sebagian',
  lunas: 'Lunas',
}

export const TONE_STATUS_BAYAR: Record<StatusBayar, string> = {
  belum: 'bg-rose-100 text-rose-800',
  sebagian: 'bg-amber-100 text-amber-800',
  lunas: 'bg-emerald-100 text-emerald-800',
}

/** Pembayaran milik sebuah PO saja. */
export function bayarMilikPo(poId: string, bayar: PoPayment[] | null | undefined): PoPayment[] {
  if (!poId) return []
  return (bayar ?? []).filter(p => p?.po_id === poId)
}

/** Total yang sudah dibayar. Nilai negatif diabaikan, bukan dikurangkan. */
export function totalDibayar(poId: string, bayar: PoPayment[] | null | undefined): number {
  return bayarMilikPo(poId, bayar).reduce((s, p) => s + Math.max(0, angka(p.jumlah)), 0)
}

/** Sisa tagihan; tidak pernah negatif walau terbayar lebih. */
export function sisaTagihan(po: Pick<PurchaseOrder, 'id' | 'total'>, bayar: PoPayment[] | null | undefined): number {
  return Math.max(0, angka(po?.total) - totalDibayar(po?.id ?? '', bayar))
}

export function statusBayar(
  po: Pick<PurchaseOrder, 'id' | 'total'>,
  bayar: PoPayment[] | null | undefined,
): StatusBayar {
  const total = angka(po?.total)
  const dibayar = totalDibayar(po?.id ?? '', bayar)
  if (dibayar <= 0) return 'belum'
  // PO bernilai nol dengan pembayaran tercatat tetap dianggap lunas.
  if (total <= 0 || dibayar >= total) return 'lunas'
  return 'sebagian'
}

// ── Jatuh tempo ─────────────────────────────────────────────────────────────

/** Tanggal (YYYY-MM-DD) → hari sejak epoch, tanpa pengaruh zona waktu. */
function hariDari(tgl: string | null | undefined): number | null {
  const s = (tgl ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000)
}

function keTanggal(hari: number): string {
  return new Date(hari * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Tanggal nota paling awal pada PO ini. Inilah yang memulai hitungan tempo;
 * null bila belum ada DO atau vendor belum menyerahkan notanya.
 */
export function tanggalNotaAwal(poId: string, dos: DeliveryOrder[] | null | undefined): string | null {
  const hari = doMilikPo(poId, dos)
    .map(d => hariDari(d.tanggal_nota))
    .filter((h): h is number => h !== null)
  return hari.length === 0 ? null : keTanggal(Math.min(...hari))
}

/**
 * Jatuh tempo pembayaran. null bila belum ada nota — PO yang barangnya belum
 * datang memang belum punya tagihan yang bisa lewat tempo.
 *
 * Term 'cash' jatuh tempo pada hari notanya juga (term_hari diabaikan).
 */
export function jatuhTempo(
  po: Pick<PurchaseOrder, 'id' | 'term' | 'term_hari'>,
  dos: DeliveryOrder[] | null | undefined,
): string | null {
  const awal = hariDari(tanggalNotaAwal(po?.id ?? '', dos))
  if (awal === null) return null
  const tambah = po?.term === 'term' ? Math.max(0, Math.trunc(angka(po.term_hari))) : 0
  return keTanggal(awal + tambah)
}

export type StatusTagihan =
  | 'lunas'
  | 'belum_tertagih'   // barang/nota belum ada, tempo belum berjalan
  | 'terlambat'
  | 'jatuh_tempo_hari_ini'
  | 'akan_jatuh_tempo'

export const LABEL_STATUS_TAGIHAN: Record<StatusTagihan, string> = {
  lunas: 'Lunas',
  belum_tertagih: 'Belum Tertagih',
  terlambat: 'Lewat Tempo',
  jatuh_tempo_hari_ini: 'Jatuh Tempo Hari Ini',
  akan_jatuh_tempo: 'Belum Jatuh Tempo',
}

export const TONE_STATUS_TAGIHAN: Record<StatusTagihan, string> = {
  lunas: 'bg-emerald-100 text-emerald-800',
  belum_tertagih: 'bg-slate-100 text-slate-600',
  terlambat: 'bg-rose-100 text-rose-800',
  jatuh_tempo_hari_ini: 'bg-amber-100 text-amber-800',
  akan_jatuh_tempo: 'bg-sky-100 text-sky-800',
}

export interface RingkasTagihan {
  po: PurchaseOrder
  statusTerima: StatusTerima
  statusBayar: StatusBayar
  statusTagihan: StatusTagihan
  dibayar: number
  sisa: number
  jatuhTempo: string | null
  /** Sisa hari menuju jatuh tempo; negatif berarti sudah lewat. null bila belum tertagih. */
  hariLagi: number | null
}

/** Ringkasan satu PO: sudah datang belum, sudah dibayar belum, tempo kapan. */
export function ringkasTagihan(
  po: PurchaseOrder,
  dos: DeliveryOrder[] | null | undefined,
  bayar: PoPayment[] | null | undefined,
  hariIni = new Date(),
): RingkasTagihan {
  const bayarStatus = statusBayar(po, bayar)
  const tempo = jatuhTempo(po, dos)
  const hTempo = hariDari(tempo)
  const hKini = hariDari(hariIni.toISOString().slice(0, 10))
  const hariLagi = hTempo !== null && hKini !== null ? hTempo - hKini : null

  let tagihan: StatusTagihan
  if (bayarStatus === 'lunas') tagihan = 'lunas'
  else if (hariLagi === null) tagihan = 'belum_tertagih'
  else if (hariLagi < 0) tagihan = 'terlambat'
  else if (hariLagi === 0) tagihan = 'jatuh_tempo_hari_ini'
  else tagihan = 'akan_jatuh_tempo'

  return {
    po,
    statusTerima: statusTerima(po.items, doMilikPo(po.id, dos)),
    statusBayar: bayarStatus,
    statusTagihan: tagihan,
    dibayar: totalDibayar(po.id, bayar),
    sisa: sisaTagihan(po, bayar),
    jatuhTempo: tempo,
    hariLagi,
  }
}

/** Hanya PO yang sudah dikirim ke vendor yang punya kewajiban bayar. */
const STATUS_PO_BERTAGIHAN = new Set(['terkirim', 'selesai'])

export interface RingkasHutang {
  baris: RingkasTagihan[]
  totalHutang: number
  totalTerlambat: number
  jumlahTerlambat: number
  jumlahJatuhTempoHariIni: number
}

/**
 * Daftar hutang ke vendor, diurutkan mendesak lebih dulu: yang terlambat di
 * atas, lalu yang jatuh temponya paling dekat. PO draf/ditolak tidak ikut —
 * belum ada kewajiban membayarnya.
 */
export function ringkasHutang(
  pos: PurchaseOrder[] | null | undefined,
  dos: DeliveryOrder[] | null | undefined,
  bayar: PoPayment[] | null | undefined,
  hariIni = new Date(),
): RingkasHutang {
  const baris = (pos ?? [])
    .filter(p => STATUS_PO_BERTAGIHAN.has(p?.status))
    .map(p => ringkasTagihan(p, dos, bayar, hariIni))

  const URUTAN: Record<StatusTagihan, number> = {
    terlambat: 0, jatuh_tempo_hari_ini: 1, akan_jatuh_tempo: 2,
    belum_tertagih: 3, lunas: 4,
  }
  baris.sort((a, b) => {
    const u = URUTAN[a.statusTagihan] - URUTAN[b.statusTagihan]
    if (u !== 0) return u
    if (a.hariLagi !== null && b.hariLagi !== null) return a.hariLagi - b.hariLagi
    return 0
  })

  const belumLunas = baris.filter(b => b.statusBayar !== 'lunas')
  return {
    baris,
    totalHutang: belumLunas.reduce((s, b) => s + b.sisa, 0),
    totalTerlambat: belumLunas.filter(b => b.statusTagihan === 'terlambat')
      .reduce((s, b) => s + b.sisa, 0),
    jumlahTerlambat: baris.filter(b => b.statusTagihan === 'terlambat').length,
    jumlahJatuhTempoHariIni: baris.filter(b => b.statusTagihan === 'jatuh_tempo_hari_ini').length,
  }
}

/** Teks singkat sisa waktu, mis. "telat 3 hari" / "5 hari lagi". */
export function teksTempo(hariLagi: number | null): string {
  if (hariLagi === null) return 'Belum tertagih'
  if (hariLagi < 0) return `Telat ${Math.abs(hariLagi)} hari`
  if (hariLagi === 0) return 'Jatuh tempo hari ini'
  return `${hariLagi} hari lagi`
}

// ── Nomor DO otomatis ───────────────────────────────────────────────────────

/** Nomor DO internal bila vendor tidak membawa nomor surat jalan sendiri. */
export function nomorDo(count: number, sekarang = new Date()): string {
  const n = String(Math.max(0, Math.trunc(angka(count))) + 1).padStart(3, '0')
  const bl = String(sekarang.getMonth() + 1).padStart(2, '0')
  return `DO/${n}/${bl}/${sekarang.getFullYear()}`
}
