// ============================================================
// PropFS — Membaca kembali laporan Excel yang diekspor sendiri
//
// KENAPA BERKAS INI ADA.
//
// Pengeluaran satu proyek terhapus oleh satu ketukan pada "Reset", dan
// satu-satunya salinan yang tersisa adalah laporan Excel yang sempat diunduh
// sebelumnya. Mengetik ulang empat belas transaksi — tanggal, volume, harga
// satuan, supplier, nomor nota — bukan pekerjaan yang pantas diminta dari
// siapa pun untuk memperbaiki kesalahan satu ketukan.
//
// Aplikasi ini yang membuat berkasnya, jadi ia tahu persis bentuknya. Membaca
// kembali keluaran sendiri adalah hal termudah yang bisa dilakukannya, dan
// selama ini tidak pernah ditawarkan.
//
// ID SENGAJA DIBUAT BARU, TIDAK DIAMBIL DARI BERKASNYA.
//
// Bukan karena id-nya tidak ada di sana — memang tidak ada — melainkan karena
// id lama justru berbahaya. Id yang sudah terhapus punya NISAN di cloud, dan
// penggabungan memberlakukan nisan tanpa syarat. Memulihkan dengan id lama
// berarti entrinya muncul sebentar lalu dihapus lagi oleh sinkronisasi
// berikutnya — kegagalan yang paling membingungkan, karena tidak ada galat
// apa pun yang muncul.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi.ts'

const teks = (v: unknown): string => String(v ?? '').trim()

/**
 * Angka dari sel Excel, yang bisa berupa angka maupun tulisan.
 *
 * "Rp 1.750.000" dan "1750000" dan 1750000 harus menghasilkan hal yang sama.
 * Titik di sini pemisah RIBUAN, bukan desimal — Number("1.750.000") bernilai
 * NaN, dan Number("1.750") bernilai 1,75. Keduanya salah dengan cara yang
 * tidak terlihat sampai totalnya dijumlahkan.
 */
export function angkaSel(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = teks(v)
  if (!s) return 0
  const bersih = s.replace(/[^\d,-]/g, '').replace(/,/g, '.')
  const n = Number(bersih)
  return Number.isFinite(n) ? n : 0
}

/** Tanggal YYYY-MM-DD dari sel; kosong bila tidak terbaca. */
export function tanggalSel(v: unknown): string {
  const s = teks(v)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  // dd/mm/yyyy — urutan Indonesia, bukan Amerika.
  const id = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (id) return `${id[3]}-${id[2].padStart(2, '0')}-${id[1].padStart(2, '0')}`
  return ''
}

/** Satu sheet sebagai larik baris (array of arrays), apa adanya. */
export type BarisSheet = unknown[]

/**
 * Cari baris header dan kembalikan datanya.
 *
 * Sheet hasil ekspor punya judul, subjudul, dan baris kosong di atas
 * headernya, lalu baris TOTAL di bawah. Posisinya bergeser bila kop
 * perusahaan diisi — jadi headernya DICARI, tidak dihitung.
 */
export function petakanKolom(
  baris: BarisSheet[] | null | undefined, wajib: string[],
): { kolom: Record<string, number>; data: BarisSheet[] } {
  const kosong = { kolom: {} as Record<string, number>, data: [] as BarisSheet[] }
  const semua = baris ?? []
  for (let i = 0; i < semua.length; i++) {
    const b = semua[i] ?? []
    const nama = b.map(x => teks(x).toLowerCase())
    if (!wajib.every(w => nama.some(n => n.includes(w)))) continue

    const kolom: Record<string, number> = {}
    nama.forEach((n, j) => { if (n) kolom[n] = j })
    const data = semua.slice(i + 1)
      // Baris TOTAL di kaki tabel bukan transaksi. Ikut terbaca, ia menggandakan
      // seluruh nilainya.
      .filter(r => teks(r?.[0]).toUpperCase() !== 'TOTAL')
      .filter(r => (r ?? []).some(x => teks(x) !== ''))
    return { kolom, data }
  }
  return kosong
}

/** Nilai kolom yang namanya MENGANDUNG salah satu kata kunci. */
function sel(baris: BarisSheet, kolom: Record<string, number>, ...kunci: string[]): unknown {
  for (const k of kunci) {
    for (const nama of Object.keys(kolom)) {
      if (nama.includes(k)) return baris[kolom[nama]]
    }
  }
  return ''
}

export interface HasilImpor {
  entri: RealisasiEntry[]
  totalRupiah: number
  /** Baris yang dilewati beserta sebabnya. */
  dilewati: Array<{ apa: string; sebab: string }>
}

let urut = 0
function idBaru(): string {
  urut += 1
  return `xls-${Date.now().toString(36)}-${urut}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Susun entri dari ketiga sheet laporan.
 *
 * `sheets` dipetakan dari nama sheet ke isinya sebagai larik baris. Nama yang
 * dikenali: "Pembelian Material", "Upah Tukang", "Semua Transaksi".
 *
 * Material dan Upah dibaca lebih dulu karena keduanya memuat rincian —
 * volume, harga satuan, supplier, nomor nota. "Semua Transaksi" hanya dipakai
 * untuk yang TIDAK terwakili keduanya (operasional & lainnya); memakainya
 * untuk semuanya akan membuang rinciannya.
 */
export function bacaRealisasiDariSheet(
  sheets: Record<string, BarisSheet[]> | null | undefined,
  entriSekarang?: Array<Partial<RealisasiEntry>> | null,
): HasilImpor {
  const entri: RealisasiEntry[] = []
  const dilewati: Array<{ apa: string; sebab: string }> = []

  // Tanda pengenal isi, bukan id: dua entri dengan tanggal, tipe, nominal, dan
  // nama yang sama adalah transaksi yang sama. Dipakai supaya berkas yang
  // diimpor dua kali tidak menggandakan uangnya.
  const tanda = (e: Partial<RealisasiEntry>) => [
    teks(e.tanggal), teks(e.tipe), Math.round(Number(e.jumlah) || 0),
    teks(e.namaMaterial) || teks(e.namaTukang) || teks(e.keterangan),
  ].join('|').toLowerCase()

  const sudah = new Set((entriSekarang ?? []).map(tanda))

  const tambah = (e: RealisasiEntry, apa: string) => {
    if (e.jumlah <= 0) { dilewati.push({ apa, sebab: 'nominalnya nol' }); return }
    const t = tanda(e)
    if (sudah.has(t)) { dilewati.push({ apa, sebab: 'sudah ada di aplikasi' }); return }
    sudah.add(t)
    entri.push(e)
  }

  const cari = (nama: string): BarisSheet[] => {
    for (const k of Object.keys(sheets ?? {})) {
      if (k.toLowerCase().includes(nama)) return (sheets ?? {})[k] ?? []
    }
    return []
  }

  // ── Material ─────────────────────────────────────────────────────────────
  {
    const { kolom, data } = petakanKolom(cari('material'), ['tanggal', 'total'])
    for (const b of data) {
      const nama = teks(sel(b, kolom, 'nama material', 'material'))
      tambah({
        id: idBaru(),
        tipe: 'material',
        tanggal: tanggalSel(sel(b, kolom, 'tanggal')),
        namaMaterial: nama,
        volume: angkaSel(sel(b, kolom, 'volume')) || undefined,
        satuan: teks(sel(b, kolom, 'satuan')) || undefined,
        hargaSatuan: angkaSel(sel(b, kolom, 'harga satuan')) || undefined,
        jumlah: angkaSel(sel(b, kolom, 'total')),
        namaSupplier: bukanStrip(sel(b, kolom, 'supplier')),
        nomorNota: bukanStrip(sel(b, kolom, 'nota')),
        kategori: teks(sel(b, kolom, 'kategori')).toLowerCase() || 'bangunan',
        metodePembayaran: teks(sel(b, kolom, 'metode')) || undefined,
        status: teks(sel(b, kolom, 'status')) || 'dicatat',
        keterangan: teks(sel(b, kolom, 'keterangan')) || nama,
      } as RealisasiEntry, nama || 'material tanpa nama')
    }
  }

  // ── Upah ─────────────────────────────────────────────────────────────────
  {
    const { kolom, data } = petakanKolom(cari('upah'), ['tanggal', 'total'])
    for (const b of data) {
      const nama = teks(sel(b, kolom, 'nama tukang', 'tukang'))
      tambah({
        id: idBaru(),
        tipe: 'upah',
        tanggal: tanggalSel(sel(b, kolom, 'tanggal')),
        namaTukang: nama,
        jenisKerja: bukanStrip(sel(b, kolom, 'jenis pekerjaan', 'jenis')),
        jumlahOrang: angkaSel(sel(b, kolom, 'jumlah orang')) || undefined,
        hariKerja: angkaSel(sel(b, kolom, 'hari kerja')) || undefined,
        upahHarian: angkaSel(sel(b, kolom, 'upah/orang', 'upah')) || undefined,
        jumlah: angkaSel(sel(b, kolom, 'total upah', 'total')),
        kategori: 'upah',
        metodePembayaran: teks(sel(b, kolom, 'metode')) || undefined,
        status: teks(sel(b, kolom, 'status')) || 'dicatat',
        keterangan: teks(sel(b, kolom, 'keterangan')) || nama,
      } as RealisasiEntry, nama || 'upah tanpa nama')
    }
  }

  // ── Sisanya: operasional & lainnya ───────────────────────────────────────
  //
  // Hanya yang tipenya BUKAN material/upah. Keduanya sudah dibaca dari sheet
  // rinci di atas, dan membacanya lagi di sini akan menggandakan uangnya
  // sekaligus membuang rinciannya.
  {
    const { kolom, data } = petakanKolom(cari('semua transaksi'), ['tanggal', 'tipe'])
    for (const b of data) {
      const tipe = teks(sel(b, kolom, 'tipe')).toLowerCase()
      if (tipe === 'material' || tipe === 'upah') continue
      const ket = teks(sel(b, kolom, 'keterangan'))
      tambah({
        id: idBaru(),
        tipe: (tipe === 'operasional' ? 'operasional' : 'lainnya') as RealisasiEntry['tipe'],
        tanggal: tanggalSel(sel(b, kolom, 'tanggal')),
        jumlah: angkaSel(sel(b, kolom, 'total')),
        kategori: teks(sel(b, kolom, 'kategori')).toLowerCase() || 'lainnya',
        status: teks(sel(b, kolom, 'status')) || 'dicatat',
        keterangan: ket,
      } as RealisasiEntry, ket || 'transaksi tanpa keterangan')
    }
  }

  return {
    entri,
    totalRupiah: entri.reduce((s, e) => s + e.jumlah, 0),
    dilewati,
  }
}

/** "-" di laporan berarti kosong, bukan nama yang sebenarnya. */
function bukanStrip(v: unknown): string | undefined {
  const s = teks(v)
  return s && s !== '-' ? s : undefined
}

/** Kalimat konfirmasi — menyebut nominal, karena itu yang bisa dicocokkan orang. */
export function kalimatImpor(h: HasilImpor | null | undefined): string {
  const n = h?.entri.length ?? 0
  const lewat = h?.dilewati.length ?? 0
  if (n < 1) {
    return lewat > 0
      ? `Tidak ada yang bisa dimasukkan — ${lewat} baris dilewati (sudah ada, atau nominalnya nol).`
      : 'Tidak ada transaksi yang terbaca dari berkas ini.'
  }
  const rupiah = `Rp ${Math.round(h?.totalRupiah ?? 0).toLocaleString('id-ID')}`
  const bagian = [`${n} transaksi senilai ${rupiah} akan dimasukkan dari laporan Excel.`]
  if (lewat > 0) bagian.push(`${lewat} baris dilewati karena sudah ada atau nominalnya nol.`)
  bagian.push('Entri yang sekarang ada tidak diubah.')
  return bagian.join(' ')
}
