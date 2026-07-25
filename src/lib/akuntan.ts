// ============================================================
// PropFS — Modul Akuntan (logika murni, tanpa DOM)
// Laba Rugi, Neraca sederhana, dan Inventori material diturunkan
// dari data pemasukan + realisasi biaya + penyesuaian stok.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi'

/** Proyek tempat entri dicatat; entri lama tanpa proyek masuk grup ini. */
export const PROYEK_UMUM = '__umum__'
export const LABEL_PROYEK_UMUM = 'Umum (Non-Proyek)'

export interface PemasukanEntry {
  id: string
  tanggal: string // YYYY-MM-DD
  sumber: string // mis. "Termin 1 Ruko A", "Penjualan Unit B-02", "Modal disetor"
  kategori: 'termin' | 'penjualan' | 'modal' | 'lainnya'
  jumlah: number
  keterangan?: string
  /** Diisi otomatis dari proyek aktif. Kosong = entri lama / non-proyek. */
  projectId?: string
}

/** Penyesuaian stok manual: qty positif = barang masuk, negatif = terpakai/keluar. */
export interface InventoryAdjustment {
  id: string
  tanggal: string
  nama: string
  satuan: string
  qty: number
  keterangan?: string
  /** Diisi otomatis dari proyek aktif. Kosong = entri lama / non-proyek. */
  projectId?: string
}

/** Lingkup laporan akuntan: seluruh proyek, satu proyek, atau non-proyek. */
export type LingkupAkuntan = { jenis: 'konsolidasi' } | { jenis: 'proyek'; projectId: string }

/** Saring entri sesuai lingkup. Entri tanpa projectId dianggap PROYEK_UMUM. */
export function saringLingkup<T extends { projectId?: string }>(rows: T[], lingkup: LingkupAkuntan): T[] {
  if (lingkup.jenis === 'konsolidasi') return rows
  return rows.filter(r => (r.projectId || PROYEK_UMUM) === lingkup.projectId)
}

export interface InventoryRow {
  nama: string
  satuan: string
  masuk: number
  keluar: number
  stok: number
  hargaRata: number
  nilai: number
}

export interface LabaRugi {
  pemasukanPerKategori: Array<{ kategori: string; jumlah: number }>
  totalPemasukan: number
  pengeluaranPerKategori: Array<{ kategori: string; jumlah: number }>
  totalPengeluaran: number
  laba: number
  perBulan: Array<{ bulan: string; pemasukan: number; pengeluaran: number; laba: number }>
}

export interface Neraca {
  kas: number
  persediaan: number
  totalAset: number
  modalDisetor: number
  labaBerjalan: number
  totalPasiva: number
  seimbang: boolean
}

const KAT_PEMASUKAN: Record<string, string> = {
  termin: 'Termin Proyek', penjualan: 'Penjualan Unit', modal: 'Modal Disetor', lainnya: 'Lainnya',
}

export function hitungLabaRugi(pemasukan: PemasukanEntry[], pengeluaran: RealisasiEntry[]): LabaRugi {
  const pIn = new Map<string, number>()
  for (const p of pemasukan) {
    const k = KAT_PEMASUKAN[p.kategori] ?? p.kategori
    pIn.set(k, (pIn.get(k) ?? 0) + p.jumlah)
  }
  const pOut = new Map<string, number>()
  for (const e of pengeluaran) {
    const k = (e.kategori || 'lainnya').toUpperCase()
    pOut.set(k, (pOut.get(k) ?? 0) + e.jumlah)
  }
  const totalPemasukan = pemasukan.reduce((s, p) => s + p.jumlah, 0)
  const totalPengeluaran = pengeluaran.reduce((s, e) => s + e.jumlah, 0)

  const bulanMap = new Map<string, { pemasukan: number; pengeluaran: number }>()
  const bln = (tgl: string) => (tgl || '').slice(0, 7) || '-'
  for (const p of pemasukan) {
    const b = bln(p.tanggal)
    const cur = bulanMap.get(b) ?? { pemasukan: 0, pengeluaran: 0 }
    cur.pemasukan += p.jumlah
    bulanMap.set(b, cur)
  }
  for (const e of pengeluaran) {
    const b = bln(e.tanggal)
    const cur = bulanMap.get(b) ?? { pemasukan: 0, pengeluaran: 0 }
    cur.pengeluaran += e.jumlah
    bulanMap.set(b, cur)
  }
  const perBulan = [...bulanMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bulan, v]) => ({ bulan, ...v, laba: v.pemasukan - v.pengeluaran }))

  return {
    pemasukanPerKategori: [...pIn.entries()].map(([kategori, jumlah]) => ({ kategori, jumlah })),
    totalPemasukan,
    pengeluaranPerKategori: [...pOut.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kategori, jumlah]) => ({ kategori, jumlah })),
    totalPengeluaran,
    laba: totalPemasukan - totalPengeluaran,
    perBulan,
  }
}

/** Inventori: pembelian material (masuk) + penyesuaian manual (+/-). */
export function hitungInventori(pengeluaran: RealisasiEntry[], adjustments: InventoryAdjustment[]): InventoryRow[] {
  const rows = new Map<string, InventoryRow & { nilaiBeli: number }>()
  const keyOf = (nama: string) => nama.trim().toLowerCase()

  for (const e of pengeluaran) {
    if (e.tipe !== 'material') continue
    const nama = (e.namaMaterial || e.keterangan || '').trim()
    if (!nama) continue
    const k = keyOf(nama)
    const cur = rows.get(k) ?? { nama, satuan: e.satuan || '-', masuk: 0, keluar: 0, stok: 0, hargaRata: 0, nilai: 0, nilaiBeli: 0 }
    const qty = e.volume ?? 0
    cur.masuk += qty
    cur.nilaiBeli += e.jumlah
    if (e.satuan) cur.satuan = e.satuan
    rows.set(k, cur)
  }
  for (const a of adjustments) {
    const k = keyOf(a.nama)
    const cur = rows.get(k) ?? { nama: a.nama.trim(), satuan: a.satuan || '-', masuk: 0, keluar: 0, stok: 0, hargaRata: 0, nilai: 0, nilaiBeli: 0 }
    if (a.qty >= 0) cur.masuk += a.qty
    else cur.keluar += -a.qty
    if (a.satuan) cur.satuan = a.satuan
    rows.set(k, cur)
  }
  return [...rows.values()]
    .map(r => {
      const stok = r.masuk - r.keluar
      const hargaRata = r.masuk > 0 ? r.nilaiBeli / r.masuk : 0
      return { nama: r.nama, satuan: r.satuan, masuk: r.masuk, keluar: r.keluar, stok, hargaRata, nilai: Math.max(0, stok) * hargaRata }
    })
    .sort((a, b) => b.nilai - a.nilai)
}

/** Neraca sederhana: Aset (kas + persediaan) = Modal disetor + laba berjalan (non-modal). */
export function hitungNeraca(pemasukan: PemasukanEntry[], pengeluaran: RealisasiEntry[], inventori: InventoryRow[]): Neraca {
  const totalPemasukan = pemasukan.reduce((s, p) => s + p.jumlah, 0)
  const totalPengeluaran = pengeluaran.reduce((s, e) => s + e.jumlah, 0)
  const modalDisetor = pemasukan.filter(p => p.kategori === 'modal').reduce((s, p) => s + p.jumlah, 0)
  const persediaan = inventori.reduce((s, r) => s + r.nilai, 0)
  const kas = totalPemasukan - totalPengeluaran
  // pengeluaran material yang masih jadi stok dipindah dari beban ke aset persediaan
  const labaBerjalan = (totalPemasukan - modalDisetor) - totalPengeluaran + persediaan
  const totalAset = kas + persediaan
  const totalPasiva = modalDisetor + labaBerjalan
  return {
    kas, persediaan, totalAset, modalDisetor, labaBerjalan, totalPasiva,
    seimbang: Math.abs(totalAset - totalPasiva) < 1,
  }
}

// ── Opname ───────────────────────────────────────────────────────────────────

export interface OpnameItem {
  uraian: string
  satuan: string
  vol_rencana: number
  vol_realisasi: number
  catatan?: string
}

export interface OpnameForm {
  id: string
  judul: string
  project_name: string
  tanggal: string
  petugas: string
  items: OpnameItem[]
  status: 'terbuka' | 'terisi' | 'disetujui'
  fill_token: string
  filled_by?: string | null
  filled_at?: string | null
  created_at?: string
}

export function progresOpname(items: OpnameItem[]): number {
  const rencana = items.reduce((s, i) => s + (i.vol_rencana || 0), 0)
  if (rencana <= 0) return 0
  const real = items.reduce((s, i) => s + Math.min(i.vol_realisasi || 0, i.vol_rencana || 0), 0)
  return (real / rencana) * 100
}

// ── Ringkasan konsolidasi antar proyek ───────────────────────────────────────

export interface BarisKonsolidasi {
  projectId: string
  namaProyek: string
  rab: number
  pemasukan: number
  pengeluaran: number
  laba: number
  /** Progress fisik tertimbang 0–100, dari bobot biaya tiap item RAB. */
  progressPct: number
  /** Persentase RAB yang sudah terpakai (pengeluaran / rab). */
  terpakaiPct: number
  /** progressPct − terpakaiPct. Negatif = biaya berlari lebih cepat dari progres. */
  deviasiPct: number
}

export interface ProyekRingkas {
  id: string
  nama: string
  rab: number
  progressPct: number
}

/**
 * Gabungkan pemasukan + pengeluaran per proyek menjadi baris laporan
 * konsolidasi. Entri tanpa projectId dikelompokkan ke PROYEK_UMUM dan hanya
 * muncul bila memang ada datanya.
 */
export function ringkasPerProyek(
  proyek: ProyekRingkas[],
  pemasukan: PemasukanEntry[],
  pengeluaran: Array<RealisasiEntry & { projectId?: string }>,
): BarisKonsolidasi[] {
  const kunci = (id?: string) => id || PROYEK_UMUM

  const masuk = new Map<string, number>()
  for (const p of pemasukan) masuk.set(kunci(p.projectId), (masuk.get(kunci(p.projectId)) ?? 0) + (p.jumlah || 0))

  const keluar = new Map<string, number>()
  for (const e of pengeluaran) keluar.set(kunci(e.projectId), (keluar.get(kunci(e.projectId)) ?? 0) + (e.jumlah || 0))

  const baris: BarisKonsolidasi[] = proyek.map(p => {
    const pemasukanP = masuk.get(p.id) ?? 0
    const pengeluaranP = keluar.get(p.id) ?? 0
    const terpakaiPct = p.rab > 0 ? (pengeluaranP / p.rab) * 100 : 0
    return {
      projectId: p.id,
      namaProyek: p.nama,
      rab: p.rab,
      pemasukan: pemasukanP,
      pengeluaran: pengeluaranP,
      laba: pemasukanP - pengeluaranP,
      progressPct: p.progressPct,
      terpakaiPct,
      deviasiPct: p.progressPct - terpakaiPct,
    }
  })

  // Grup non-proyek hanya ditampilkan bila ada angkanya
  const umumMasuk = masuk.get(PROYEK_UMUM) ?? 0
  const umumKeluar = keluar.get(PROYEK_UMUM) ?? 0
  if (umumMasuk !== 0 || umumKeluar !== 0) {
    baris.push({
      projectId: PROYEK_UMUM,
      namaProyek: LABEL_PROYEK_UMUM,
      rab: 0,
      pemasukan: umumMasuk,
      pengeluaran: umumKeluar,
      laba: umumMasuk - umumKeluar,
      progressPct: 0,
      terpakaiPct: 0,
      deviasiPct: 0,
    })
  }

  return baris
}

/** Total seluruh baris konsolidasi. */
export function totalKonsolidasi(baris: BarisKonsolidasi[]) {
  const rab = baris.reduce((s, b) => s + b.rab, 0)
  const pemasukan = baris.reduce((s, b) => s + b.pemasukan, 0)
  const pengeluaran = baris.reduce((s, b) => s + b.pengeluaran, 0)
  return {
    rab, pemasukan, pengeluaran,
    laba: pemasukan - pengeluaran,
    terpakaiPct: rab > 0 ? (pengeluaran / rab) * 100 : 0,
  }
}
