// ============================================================
// PropFS — Satu masukan, semua modul
//
// Realisasi Biaya, Akuntan, dan Procurement dulunya tiga pintu terpisah untuk
// satu kejadian yang sama. Sehelai nota bisa berarti: biaya bertambah, stok
// bertambah, PO menerima barang, dan hutang ke vendor mulai berjalan — tetapi
// pemakainya harus mengetiknya empat kali di empat tempat, dan yang terlewat
// membuat angkanya tidak pernah cocok.
//
// Modul ini membaca hasil AI lalu menyusun DAFTAR PERIKSA: modul mana saja
// yang tersentuh, apa yang akan tercatat di sana, dan mana yang masih butuh
// persetujuan. Isinya hanya rencana — tidak ada satu pun yang ditulis dari
// sini. Menulis adalah urusan pemanggilnya, setelah manusia menyetujui.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { RealisasiEntry, PemasukanUsul, PembayaranUsul } from './ai-realisasi'
import { cocokkanNotaKePo, namaSama, type CocokPo, type PoUntukCocok, type DoUntukCocok } from './notaKePo.ts'

const KAT_MASUK = ['termin', 'penjualan', 'modal', 'lainnya'] as const
const METODE_BAYAR = ['transfer', 'tunai', 'giro', 'lainnya'] as const
const hariIniISO = () => new Date().toISOString().split('T')[0]

export function parsePemasukan(item: any): PemasukanUsul {
  const kat = String(item?.kategori ?? '').toLowerCase()
  return {
    tanggal: item?.tanggal || hariIniISO(),
    sumber: String(item?.sumber ?? item?.keterangan ?? '').trim() || 'Pemasukan',
    kategori: (KAT_MASUK as readonly string[]).includes(kat) ? kat as PemasukanUsul['kategori'] : 'lainnya',
    jumlah: Math.max(0, Number(item?.jumlah) || 0),
    keterangan: item?.keterangan || undefined,
  }
}

export function parsePembayaran(item: any): PembayaranUsul {
  const m = String(item?.metode ?? '').toLowerCase()
  return {
    tanggal: item?.tanggal || hariIniISO(),
    nomorPo: item?.nomorPo || item?.nomor_po || undefined,
    vendor: item?.vendor || item?.namaVendor || undefined,
    jumlah: Math.max(0, Number(item?.jumlah) || 0),
    metode: (METODE_BAYAR as readonly string[]).includes(m) ? m as PembayaranUsul['metode'] : 'transfer',
    referensi: item?.referensi || undefined,
    catatan: item?.catatan || undefined,
  }
}

export type ModulCatat = 'biaya' | 'pemasukan' | 'penerimaan' | 'pembayaran' | 'stok'

export const LABEL_MODUL: Record<ModulCatat, string> = {
  biaya: 'Realisasi Biaya',
  pemasukan: 'Akuntan · Pemasukan',
  penerimaan: 'Procurement · Barang Datang',
  pembayaran: 'Akuntan · Hutang Vendor',
  stok: 'Akuntan · Inventori',
}

/** Satu baris daftar periksa yang ditampilkan sebelum pemakainya menyetujui. */
export interface LangkahCatat {
  modul: ModulCatat
  /** Ringkasan sebaris: apa yang akan tercatat di modul ini. */
  rincian: string
  /** Nominal yang terlibat, bila ada. */
  nilai: number
  /**
   * true bila modul ini terisi dengan sendirinya sebagai akibat modul lain —
   * Inventori misalnya lahir dari biaya & penerimaan, tidak punya tombol
   * sendiri. Ditampilkan supaya pemakainya tahu, bukan supaya ia mengklik.
   */
  turunan: boolean
  /** true bila langkah ini sudah dijalankan tanpa perlu persetujuan lagi. */
  sudah: boolean
  /** Hal yang perlu diketahui sebelum menyetujui. */
  catatan?: string
}

export interface PembayaranTerpasang {
  usul: PembayaranUsul
  /** PO yang cocok, terurut dari yang paling meyakinkan. Kosong = tak ada. */
  calon: PoTagihan[]
}

export interface PoTagihan {
  id: string
  nomor?: string
  vendor_nama?: string
  total: number
  sudahDibayar: number
  sisa: number
}

export interface Rencana {
  /** Pengeluaran; sudah tercatat otomatis saat AI menjawab. */
  biaya: RealisasiEntry[]
  pemasukan: PemasukanUsul[]
  /** Calon PO asal barang. Pemakainya memilih satu, atau tidak sama sekali. */
  penerimaan: CocokPo[]
  pembayaran: PembayaranTerpasang[]
  /** Perkiraan pergerakan stok, hanya untuk ditampilkan. */
  stokMasuk: number
  langkah: LangkahCatat[]
  /** true bila ada yang masih menunggu persetujuan manusia. */
  perluKonfirmasi: boolean
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const angka = (n: unknown) => Math.max(0, Number(n) || 0)

/**
 * Cocokkan bukti bayar ke PO yang masih punya sisa tagihan.
 *
 * Nomor PO yang tertulis selalu menang. Kalau tidak ada, vendor yang dipakai,
 * lalu didahulukan PO yang sisanya paling dekat dengan nominal yang dibayar —
 * orang membayar tagihan, bukan angka acak. PO yang sudah lunas tidak
 * ditawarkan lagi.
 */
export function cocokkanPembayaran(
  usul: PembayaranUsul,
  pos: Array<{ id: string; nomor?: string; vendor_nama?: string; total?: number; status?: string }>,
  sudahDibayar: (poId: string) => number,
): PoTagihan[] {
  const bayar = angka(usul?.jumlah)
  const nomor = (usul?.nomorPo ?? '').trim().toLowerCase()
  const vendor = (usul?.vendor ?? '').trim()

  const hidup = (pos ?? [])
    .filter(p => p?.id && !['draft', 'ditolak'].includes(String(p.status ?? '')))
    .map(p => {
      const total = angka(p.total)
      const dibayar = angka(sudahDibayar(p.id))
      return {
        id: p.id, nomor: p.nomor, vendor_nama: p.vendor_nama,
        total, sudahDibayar: dibayar, sisa: Math.max(0, total - dibayar),
      } as PoTagihan
    })
    .filter(p => p.sisa > 0)

  if (nomor) {
    const persis = hidup.filter(p => (p.nomor ?? '').trim().toLowerCase() === nomor)
    if (persis.length > 0) return persis
  }
  const sesuaiVendor = vendor ? hidup.filter(p => namaSama(p.vendor_nama ?? '', vendor)) : []
  const kandidat = sesuaiVendor.length > 0 ? sesuaiVendor : hidup
  if (kandidat.length === 0) return []

  return [...kandidat].sort((a, b) =>
    Math.abs(a.sisa - bayar) - Math.abs(b.sisa - bayar)
    || String(a.nomor ?? '').localeCompare(String(b.nomor ?? '')))
}

export interface KonteksRencana {
  pos?: PoUntukCocok[]
  dos?: DoUntukCocok[]
  /** Total yang sudah dibayar untuk sebuah PO. */
  sudahDibayar?: (poId: string) => number
}

/**
 * Susun daftar periksa lintas modul dari satu hasil pembacaan AI.
 *
 * Biaya sengaja ditandai SUDAH: pencatatannya adalah tugas utama tab ini dan
 * berjalan begitu AI menjawab. Menahannya di balik satu tombol lagi hanya akan
 * memperlambat pekerjaan yang sudah benar. Yang menunggu persetujuan adalah
 * langkah yang menyentuh modul lain, karena di sanalah tebakan bisa salah.
 */
export function susunRencana(
  hasil: {
    added?: RealisasiEntry[]
    pemasukan?: PemasukanUsul[]
    pembayaran?: PembayaranUsul[]
  },
  konteks: KonteksRencana = {},
): Rencana {
  const biaya = (hasil?.added ?? []).filter(Boolean)
  const pemasukan = (hasil?.pemasukan ?? []).filter(p => angka(p?.jumlah) > 0)
  const usulBayar = (hasil?.pembayaran ?? []).filter(p => angka(p?.jumlah) > 0)

  const material = biaya.filter(
    e => e.tipe === 'material' && (e.namaMaterial ?? '').trim() && angka(e.volume) > 0 && !e.doId,
  )
  const penerimaan = material.length > 0
    ? cocokkanNotaKePo(
      material.map(e => ({
        id: e.id, nama: e.namaMaterial ?? '', satuan: e.satuan,
        qty: angka(e.volume), harga: e.hargaSatuan,
      })),
      konteks.pos ?? [], konteks.dos ?? [],
      material.find(e => (e.namaSupplier ?? '').trim())?.namaSupplier ?? '',
    )
    : []

  const dibayar = konteks.sudahDibayar ?? (() => 0)
  const pembayaran: PembayaranTerpasang[] = usulBayar.map(u => ({
    usul: u,
    calon: cocokkanPembayaran(u, (konteks.pos ?? []) as Array<{ id: string; total?: number }>, dibayar),
  }))

  const totalBiaya = biaya.reduce((s, e) => s + angka(e.jumlah), 0)
  const totalMasuk = pemasukan.reduce((s, p) => s + angka(p.jumlah), 0)
  const totalBayar = usulBayar.reduce((s, p) => s + angka(p.jumlah), 0)
  const stokMasuk = material.length

  const langkah: LangkahCatat[] = []
  if (biaya.length > 0) {
    langkah.push({
      modul: 'biaya', nilai: totalBiaya, turunan: false, sudah: true,
      rincian: `${biaya.length} transaksi · ${rupiah(totalBiaya)}`,
    })
  }
  if (pemasukan.length > 0) {
    langkah.push({
      modul: 'pemasukan', nilai: totalMasuk, turunan: false, sudah: false,
      rincian: `${pemasukan.length} pemasukan · ${rupiah(totalMasuk)}`,
      catatan: 'Uang masuk dicatat di Akuntan, bukan sebagai biaya.',
    })
  }
  if (penerimaan.length > 0) {
    const teratas = penerimaan[0]
    langkah.push({
      modul: 'penerimaan', nilai: 0, turunan: false, sudah: false,
      rincian: `${teratas.pasangan.length} barang cocok dengan ${teratas.po.nomor ?? 'PO'}`,
      catatan: penerimaan.length > 1
        ? `${penerimaan.length} PO mungkin cocok — pilih yang benar.`
        : undefined,
    })
  }
  if (pembayaran.length > 0) {
    const tanpaPo = pembayaran.filter(p => p.calon.length === 0).length
    langkah.push({
      modul: 'pembayaran', nilai: totalBayar, turunan: false, sudah: false,
      rincian: `${pembayaran.length} pembayaran · ${rupiah(totalBayar)}`,
      catatan: tanpaPo > 0 ? `${tanpaPo} tidak menemukan PO yang cocok.` : undefined,
    })
  }
  if (stokMasuk > 0) {
    langkah.push({
      modul: 'stok', nilai: 0, turunan: true, sudah: true,
      rincian: `${stokMasuk} material masuk stok`,
      catatan: penerimaan.length > 0
        ? 'Bila dicatat sebagai barang datang, stoknya dihitung dari surat jalan — tidak dobel.'
        : undefined,
    })
  }

  return {
    biaya, pemasukan, penerimaan, pembayaran, stokMasuk, langkah,
    perluKonfirmasi: langkah.some(l => !l.sudah),
  }
}
