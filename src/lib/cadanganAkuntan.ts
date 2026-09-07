// ============================================================
// PropFS — Cadangan data akuntan yang dipegang sendiri
//
// KENAPA BERKAS INI ADA.
//
// Pemasukan senilai Rp 250 juta hilang, dan tidak ada satu pun baris di
// database yang bisa dipakai memulihkannya. Yang Rp 177 juta selamat hanya
// karena kebetulan ia sudah berkwitansi — kwitansi adalah baris tersendiri,
// jadi ia bertahan. Yang belum berkwitansi tidak meninggalkan apa pun.
//
// Sebabnya bentuk penyimpanannya: seluruh data akuntan hidup sebagai SATU
// dokumen JSON per pemakai di `akuntan_data`, ditulis ulang utuh setiap ada
// perubahan. Satu penulisan yang keliru menghapus semuanya sekaligus.
//
// Penjaga sinkronisasi sudah menutup jalur yang diketahui, dan pemulihan dari
// kwitansi menambal yang berkwitansi. Yang masih belum ada: SALINAN YANG
// DIPEGANG PEMILIK DATANYA SENDIRI — berkas yang bisa disimpan di HP, dikirim
// lewat WhatsApp, atau ditaruh di Drive, dan tidak bergantung pada apakah
// aplikasinya berperilaku benar.
//
// Itu yang dikerjakan berkas ini. Bukan pengganti sinkronisasi; jaring
// terakhir kalau sinkronisasinya sendiri yang keliru.
//
// PENGGABUNGAN, BUKAN PENIMPAAN. Memasukkan cadangan tidak pernah membuang
// yang sekarang ada: entri dicocokkan per id, yang sudah ada dibiarkan, dan
// yang sengaja dihapus tidak dihidupkan lagi. Cadangan yang menimpa akan
// mengulang persoalan yang sama dari arah sebaliknya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { PemasukanEntry, InventoryAdjustment } from './akuntan.ts'

const teks = (v: unknown): string => String(v ?? '').trim()
const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const larik = <T>(v: unknown): T[] => Array.isArray(v) ? v as T[] : []

/** Bentuk berkas cadangan. Versinya ikut supaya bisa dikenali di kemudian hari. */
export interface BerkasCadangan {
  jenis: 'propfs-akuntan'
  versi: 1
  dibuat: string
  pemasukanEntries: PemasukanEntry[]
  inventoryAdjustments: InventoryAdjustment[]
  biayaUmumEntries: unknown[]
  hapusan: Array<{ id: string; at?: string }>
}

export interface IsiAkuntanRingkas {
  pemasukanEntries?: unknown
  inventoryAdjustments?: unknown
  biayaUmumEntries?: unknown
  hapusan?: unknown
}

/** Susun berkas cadangan dari keadaan store. */
export function buatCadangan(isi: IsiAkuntanRingkas | null | undefined, sekarang = new Date()): BerkasCadangan {
  return {
    jenis: 'propfs-akuntan',
    versi: 1,
    dibuat: sekarang.toISOString(),
    pemasukanEntries: larik<PemasukanEntry>(isi?.pemasukanEntries),
    inventoryAdjustments: larik<InventoryAdjustment>(isi?.inventoryAdjustments),
    biayaUmumEntries: larik(isi?.biayaUmumEntries),
    hapusan: larik<{ id: string; at?: string }>(isi?.hapusan),
  }
}

/** Nama berkas yang menyebutkan tanggalnya — supaya cadangan lama tidak tertimpa. */
export function namaBerkasCadangan(sekarang = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `propfs-akuntan-${sekarang.getFullYear()}${p(sekarang.getMonth() + 1)}${p(sekarang.getDate())}`
    + `-${p(sekarang.getHours())}${p(sekarang.getMinutes())}.json`
}

export interface RingkasCadangan {
  pemasukan: number
  totalRupiah: number
  biayaUmum: number
  inventori: number
  dibuat: string
}

export function ringkasCadangan(c: BerkasCadangan | null | undefined): RingkasCadangan {
  const pm = larik<PemasukanEntry>(c?.pemasukanEntries)
  return {
    pemasukan: pm.length,
    totalRupiah: pm.reduce((s, p) => s + angka(p?.jumlah), 0),
    biayaUmum: larik(c?.biayaUmumEntries).length,
    inventori: larik(c?.inventoryAdjustments).length,
    dibuat: teks(c?.dibuat),
  }
}

/**
 * Baca berkas yang dipilih pemakai.
 *
 * Menolak dengan SEBAB, bukan diam. Berkas yang salah dipilih adalah kejadian
 * biasa — dan "tidak terjadi apa-apa" setelah memilih berkas terbaca sebagai
 * aplikasi yang rusak, bukan sebagai berkas yang keliru.
 */
export function bacaCadangan(teksBerkas: unknown): { isi: BerkasCadangan | null; galat: string } {
  let mentah: unknown
  try {
    mentah = JSON.parse(String(teksBerkas ?? ''))
  } catch {
    return { isi: null, galat: 'Berkasnya bukan JSON yang bisa dibaca.' }
  }
  if (!mentah || typeof mentah !== 'object') {
    return { isi: null, galat: 'Isi berkasnya kosong atau bukan data cadangan.' }
  }
  const o = mentah as Record<string, unknown>
  if (teks(o.jenis) !== 'propfs-akuntan') {
    return { isi: null, galat: 'Ini bukan berkas cadangan akuntan PropFS.' }
  }
  const pm = larik<PemasukanEntry>(o.pemasukanEntries)
  const iv = larik<InventoryAdjustment>(o.inventoryAdjustments)
  const bu = larik(o.biayaUmumEntries)
  if (pm.length + iv.length + bu.length === 0) {
    return { isi: null, galat: 'Cadangannya tidak berisi satu catatan pun.' }
  }
  return {
    isi: {
      jenis: 'propfs-akuntan', versi: 1, dibuat: teks(o.dibuat),
      pemasukanEntries: pm, inventoryAdjustments: iv, biayaUmumEntries: bu,
      hapusan: larik<{ id: string; at?: string }>(o.hapusan),
    },
    galat: '',
  }
}

export interface RencanaMasuk {
  /** Entri pemasukan yang akan ditambahkan. */
  pemasukan: PemasukanEntry[]
  totalRupiah: number
  /** Sudah ada di aplikasi, tidak diapa-apakan. */
  sudahAda: number
  /** Sengaja dihapus, tidak dihidupkan lagi. */
  bernisan: number
}

/**
 * Susun apa yang akan masuk dari sebuah cadangan.
 *
 * Nisan dibaca dari KEDUANYA — yang sekarang dan yang di cadangan. Entri yang
 * dihapus di perangkat lain sesudah cadangan dibuat tidak boleh hidup lagi
 * hanya karena cadangannya lebih tua.
 */
export function rencanaMasuk(
  cadangan: BerkasCadangan | null | undefined,
  pemasukanSekarang: Array<{ id?: string }> | null | undefined,
  nisanSekarang?: Array<string | { id?: string }> | null,
): RencanaMasuk {
  const ada = new Set((pemasukanSekarang ?? []).map(p => teks(p?.id)).filter(Boolean))
  const idNisan = (h: string | { id?: string }) => typeof h === 'string' ? teks(h) : teks(h?.id)
  const nisan = new Set([
    ...(nisanSekarang ?? []).map(idNisan),
    ...larik<{ id?: string }>(cadangan?.hapusan).map(h => teks(h?.id)),
  ].filter(Boolean))

  const pemasukan: PemasukanEntry[] = []
  let sudahAda = 0
  let bernisan = 0
  const dipakai = new Set<string>()

  for (const e of larik<PemasukanEntry>(cadangan?.pemasukanEntries)) {
    const id = teks(e?.id)
    if (!id || dipakai.has(id)) continue
    if (ada.has(id)) { sudahAda++; continue }
    if (nisan.has(id)) { bernisan++; continue }
    dipakai.add(id)
    pemasukan.push({ ...e, id, jumlah: angka(e?.jumlah) })
  }

  return {
    pemasukan,
    totalRupiah: pemasukan.reduce((s, e) => s + e.jumlah, 0),
    sudahAda,
    bernisan,
  }
}

/** Kalimat konfirmasi — menyebut nominal, karena itu yang bisa dicocokkan orang. */
export function kalimatMasuk(r: RencanaMasuk | null | undefined): string {
  const n = r?.pemasukan.length ?? 0
  if (n < 1) {
    if ((r?.sudahAda ?? 0) > 0) return 'Semua catatan di cadangan ini sudah ada di aplikasi.'
    if ((r?.bernisan ?? 0) > 0) return 'Catatan di cadangan ini sudah pernah dihapus dengan sengaja.'
    return 'Tidak ada catatan yang bisa dimasukkan dari cadangan ini.'
  }
  const rupiah = `Rp ${Math.round(r?.totalRupiah ?? 0).toLocaleString('id-ID')}`
  const bagian = [`${n} pemasukan senilai ${rupiah} akan ditambahkan dari cadangan.`]
  if ((r?.sudahAda ?? 0) > 0) bagian.push(`${r?.sudahAda} yang sudah ada dibiarkan apa adanya.`)
  if ((r?.bernisan ?? 0) > 0) bagian.push(`${r?.bernisan} yang pernah dihapus tidak dihidupkan lagi.`)
  return bagian.join(' ')
}
