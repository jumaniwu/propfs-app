// ============================================================
// PropFS — Modul Akuntan (logika murni, tanpa DOM)
// Laba Rugi, Neraca sederhana, dan Inventori material diturunkan
// dari data pemasukan + realisasi biaya + penyesuaian stok.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi'
import { pengelompokNama } from './namaMaterial.ts'

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

/** Satu baris barang pada surat jalan yang sudah dikonfirmasi diterima. */
export interface PenerimaanBarang {
  nama: string
  satuan?: string
  qty: number
  /** Harga satuan dari PO-nya. Tanpa ini barangnya masuk stok tanpa nilai. */
  harga?: number
}

/** Pemakaian material di lapangan — inilah yang mengeluarkan barang dari stok. */
export interface PemakaianBarang {
  nama: string
  satuan?: string
  qty: number
}

export interface InventoryRow {
  nama: string
  satuan: string
  masuk: number
  keluar: number
  stok: number
  hargaRata: number
  nilai: number
  /** Dari mana `masuk` berasal — supaya angkanya bisa ditelusuri, bukan cuma dipercaya. */
  dariPembelian: number
  dariPenerimaan: number
  dariPenyesuaian: number
  /** Bagian `keluar` yang datang dari catatan pemakaian lapangan. */
  dariLapangan: number
  /**
   * Nota pembelian dan surat jalan bisa menyebut barang yang sama, dan sistem
   * tidak punya cara memastikan keduanya bukan satu kejadian yang sama. Tanda
   * ini menyerahkan penilaiannya ke manusia, bukan diam-diam menjumlah dua kali.
   */
  mungkinDobel: boolean
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

/**
 * Inventori: pembelian material dari nota (masuk), penerimaan barang dari
 * surat jalan yang sudah dikonfirmasi (masuk), pemakaian di lapangan (keluar),
 * dan penyesuaian manual (+/-).
 *
 * Penerimaan sengaja masuk sebagai sumber tersendiri, bukan disamakan dengan
 * pembelian: barang yang sudah dipesan belum tentu sudah datang, dan yang
 * mengubah stok adalah kedatangannya. Nilainya diambil dari harga PO supaya
 * persediaan di neraca tidak menjadi nol rupiah.
 */
export function hitungInventori(
  pengeluaran: RealisasiEntry[],
  adjustments: InventoryAdjustment[],
  penerimaan: PenerimaanBarang[] = [],
  pemakaian: PemakaianBarang[] = [],
): InventoryRow[] {
  type Baris = InventoryRow & { nilaiBeli: number }
  const rows = new Map<string, Baris>()
  const angka = (n: unknown) => Math.max(0, Number(n) || 0)

  // Satu barang sering tertulis dengan beberapa nama — nota dari toko, item PO,
  // dan koreksi gudang diketik orang yang berbeda. Kelompoknya disusun dari
  // SELURUH nama yang terlibat lebih dulu supaya stoknya tidak terbagi.
  const kelompok = pengelompokNama([
    ...pengeluaran.filter(e => e?.tipe === 'material').map(e => e?.namaMaterial || e?.keterangan || ''),
    ...penerimaan.map(d => d?.nama ?? ''),
    ...pemakaian.map(p => p?.nama ?? ''),
    ...adjustments.map(a => a?.nama ?? ''),
  ])

  const ambil = (nama: string, satuan?: string): Baris | null => {
    const bersih = kelompok.tampilan(nama)
    if (!bersih) return null
    const k = kelompok.kunci(nama)
    const cur = rows.get(k) ?? {
      nama: bersih, satuan: satuan || '-',
      masuk: 0, keluar: 0, stok: 0, hargaRata: 0, nilai: 0, nilaiBeli: 0,
      dariPembelian: 0, dariPenerimaan: 0, dariPenyesuaian: 0, dariLapangan: 0,
      mungkinDobel: false,
    }
    if (satuan) cur.satuan = satuan
    rows.set(k, cur)
    return cur
  }

  for (const e of pengeluaran) {
    if (e.tipe !== 'material') continue
    // Nota yang sudah dicatat sekaligus sebagai surat jalan tetap menjadi
    // biaya, tetapi stoknya diserahkan ke surat jalan itu. Tanpa aturan ini
    // satu kiriman masuk gudang dua kali.
    if (e.doId) continue
    const cur = ambil((e.namaMaterial || e.keterangan || ''), e.satuan)
    if (!cur) continue
    const qty = e.volume ?? 0
    cur.masuk += qty
    cur.dariPembelian += qty
    cur.nilaiBeli += e.jumlah
  }
  for (const d of penerimaan) {
    const cur = ambil(d?.nama ?? '', d?.satuan)
    if (!cur) continue
    const qty = angka(d.qty)
    cur.masuk += qty
    cur.dariPenerimaan += qty
    cur.nilaiBeli += qty * angka(d.harga)
  }
  for (const p of pemakaian) {
    const cur = ambil(p?.nama ?? '', p?.satuan)
    if (!cur) continue
    const qty = angka(p.qty)
    cur.keluar += qty
    cur.dariLapangan += qty
  }
  for (const a of adjustments) {
    const cur = ambil(a.nama, a.satuan)
    if (!cur) continue
    if (a.qty >= 0) cur.masuk += a.qty
    else cur.keluar += -a.qty
    cur.dariPenyesuaian += a.qty
  }

  return [...rows.values()]
    .map(({ nilaiBeli, ...r }) => {
      const stok = r.masuk - r.keluar
      // Pembaginya seluruh qty masuk, termasuk yang datang tanpa harga
      // (penyesuaian manual, atau DO yang barangnya tidak ada di PO). Barang
      // tak berharga jadi mengencerkan rata-rata, bukan dinilai seharga
      // pembelian — nilai persediaan di neraca tidak boleh naik karena ada
      // barang yang justru tidak diketahui harganya.
      const hargaRata = r.masuk > 0 ? nilaiBeli / r.masuk : 0
      return {
        ...r, stok, hargaRata,
        nilai: Math.max(0, stok) * hargaRata,
        mungkinDobel: r.dariPembelian > 0 && r.dariPenerimaan > 0,
      }
    })
    .sort((a, b) => b.nilai - a.nilai)
}

/**
 * Ubah surat jalan menjadi baris penerimaan siap hitung: hanya DO milik proyek
 * yang diminta, dengan harga satuan diambil dari PO-nya sesuai nama barang.
 *
 * Nama proyek kosong berarti "semua proyek" (tampilan konsolidasi). Itu wajar
 * di sini — berbeda dengan halaman publik, pemakainya memang pemilik datanya.
 */
export function penerimaanInventori(
  dos: Array<{ po_id: string; items?: unknown }>,
  pos: Array<{ id: string; project_name?: string; items?: unknown }>,
  namaProyek = '',
  requests: Array<{ id: string; project_name?: string }> = [],
): PenerimaanBarang[] {
  const cocok = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const poById = new Map(pos.map(p => [p.id, p]))

  // Jalur cadangan ketika `project_name` PO kosong — dan itu sering terjadi,
  // karena kolomnya diisi dari proyek yang kebetulan aktif saat PO dibuat.
  // Material Request asal barangnya tahu proyeknya, dan tautannya berupa id
  // sehingga tidak bisa putus karena beda penulisan nama.
  const idRequestProyek = new Set(
    (requests ?? [])
      .filter(r => !namaProyek || cocok(r.project_name ?? '', namaProyek))
      .map(r => r.id),
  )
  const lewatRequest = (po: { items?: unknown }) =>
    (Array.isArray(po.items) ? po.items as Array<Record<string, unknown>> : [])
      .some(it => idRequestProyek.has(String(it?.request_id ?? '')))

  const hasil: PenerimaanBarang[] = []

  for (const d of dos ?? []) {
    const po = poById.get(d?.po_id ?? '')
    // Tanpa PO-nya, asal barang tidak bisa dipastikan milik proyek yang mana.
    if (!po) continue
    if (namaProyek && !cocok(po.project_name ?? '', namaProyek) && !lewatRequest(po)) continue

    const itemsPo = Array.isArray(po.items) ? po.items as Array<Record<string, unknown>> : []
    for (const it of (Array.isArray(d.items) ? d.items as Array<Record<string, unknown>> : [])) {
      const nama = String(it?.nama ?? '').trim()
      if (!nama) continue
      const diPo = itemsPo.find(x => cocok(String(x?.nama ?? ''), nama))
      hasil.push({
        nama,
        satuan: String(it?.satuan ?? diPo?.satuan ?? ''),
        qty: Number(it?.qty) || 0,
        harga: Number(diPo?.harga) || 0,
      })
    }
  }
  return hasil
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
