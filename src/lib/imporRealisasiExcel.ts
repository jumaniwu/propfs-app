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
 * INI YANG DULU SALAH, DAN SALAHNYA TIDAK KELIHATAN.
 *
 * Laporan menulis angkanya dengan format `#,##0`, dan ketika dibaca kembali
 * Excel menyerahkannya sebagai "5,520,000" — koma sebagai pemisah RIBUAN
 * gaya Amerika, bukan desimal gaya Indonesia. Versi pertama menukar setiap
 * koma menjadi titik, jadi "5,520,000" menjadi "5.520.000", dan
 * Number("5.520.000") bernilai NaN. Setiap baris terbaca nol, lalu ditolak
 * dengan alasan "nominalnya nol" — laporan berisi empat belas transaksi
 * masuk sebagai tidak ada apa-apa, tanpa satu pun galat.
 *
 * Jadi pemisahnya tidak boleh ditebak dari jenis karakternya, melainkan dari
 * susunannya:
 *
 * - dua jenis pemisah bercampur ("1.234,56") — yang terakhir pasti desimal
 * - satu jenis, muncul berkali-kali ("5,520,000") — semuanya ribuan
 * - satu jenis, sekali, tepat tiga angka di belakangnya ("1.750") — ribuan
 * - selain itu ("12,5") — desimal
 */
export function angkaSel(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const asli = teks(v)
  if (!asli) return 0
  // Akuntan menulis angka negatif di dalam kurung.
  const negatif = /^\(.*\)$/.test(asli) || /^-/.test(asli)
  const s = asli.replace(/[^\d.,]/g, '')
  if (!s) return 0

  const pemisah = s.match(/[.,]/g) ?? []
  let angka = s
  if (pemisah.length > 0) {
    const terakhir = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
    const ekor = s.length - terakhir - 1
    const jenis = new Set(pemisah)
    const desimal = jenis.size > 1 ? true : pemisah.length > 1 ? false : ekor !== 3
    angka = desimal
      ? `${s.slice(0, terakhir).replace(/[.,]/g, '')}.${s.slice(terakhir + 1)}`
      : s.replace(/[.,]/g, '')
  }

  const n = Number(angka)
  if (!Number.isFinite(n)) return 0
  return negatif && n > 0 ? -n : n
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

/**
 * Angka yang disebut laporan tentang dirinya sendiri.
 *
 * Sheet "Ringkasan" memuat baris TOTAL berisi jumlah transaksi dan jumlah
 * rupiah seluruhnya, dan subjudul tiap sheet menyebut "N transaksi". Itu
 * pembukuan yang dibuat laporan atas isinya sendiri — dipakai di sini untuk
 * memeriksa hasil pembacaan.
 */
export interface Checksum {
  jumlahTransaksi?: number
  totalRupiah?: number
  /** Dari mana angkanya diambil; disebutkan bila ada yang tidak cocok. */
  sumber: string[]
}

export interface Periksa {
  checksum: Checksum
  /** Yang benar-benar terbaca dari sheet rinci, sebelum penyaringan apa pun. */
  terbaca: number
  terbacaRupiah: number
  cocok: boolean
  /** Kalimat perbedaannya, bila tidak cocok. */
  selisih?: string
}

export interface HasilImpor {
  entri: RealisasiEntry[]
  totalRupiah: number
  /** Baris yang dilewati beserta sebabnya. */
  dilewati: Array<{ apa: string; sebab: string }>
  /** Hasil pencocokan silang antar sheet. */
  periksa: Periksa
}

/**
 * Baca angka yang disebut laporan tentang dirinya sendiri.
 *
 * Satu sheet saja tidak cukup untuk tahu apakah pembacaannya benar. Kalau
 * kolomnya salah dipetakan atau angkanya salah diurai, hasilnya tetap
 * kelihatan masuk akal — sampai totalnya dibandingkan dengan yang tertulis
 * di laporan. Perbandingan itulah satu-satunya hal yang bisa membedakan
 * "terbaca dengan benar" dari "terbaca dengan rapi tapi salah".
 */
export function bacaChecksum(
  sheets: Record<string, BarisSheet[]> | null | undefined,
): Checksum {
  const hasil: Checksum = { sumber: [] }
  const semua = sheets ?? {}

  // Baris TOTAL di sheet Ringkasan: paling dapat dipercaya, karena isinya
  // rumus SUM atas seluruh transaksi.
  for (const nama of Object.keys(semua)) {
    if (!nama.toLowerCase().includes('ringkasan')) continue
    const baris = semua[nama] ?? []
    let kolTransaksi = -1
    let kolRupiah = -1
    for (const b of baris) {
      const sel0 = teks((b ?? [])[0]).toUpperCase()
      const nama2 = (b ?? []).map(x => teks(x).toLowerCase())
      if (kolTransaksi < 0 && nama2.some(n => n.includes('uraian'))) {
        kolTransaksi = nama2.findIndex(n => n.includes('transaksi'))
        kolRupiah = nama2.findIndex(n => n.includes('jumlah (rp)') || n.includes('(rp)'))
        continue
      }
      if (sel0 !== 'TOTAL') continue
      if (kolTransaksi >= 0) hasil.jumlahTransaksi = angkaSel((b ?? [])[kolTransaksi])
      if (kolRupiah >= 0) hasil.totalRupiah = angkaSel((b ?? [])[kolRupiah])
      hasil.sumber.push('baris TOTAL sheet Ringkasan')
      break
    }
    break
  }

  // Subjudul menyebut "N transaksi"; dipakai bila Ringkasan tidak terbaca.
  if (hasil.jumlahTransaksi === undefined) {
    for (const nama of Object.keys(semua)) {
      for (const b of (semua[nama] ?? []).slice(0, 4)) {
        const m = (b ?? []).map(x => teks(x)).join(' ').match(/(\d+)\s+transaksi/i)
        if (!m) continue
        hasil.jumlahTransaksi = Number(m[1])
        hasil.sumber.push(`subjudul sheet ${nama}`)
        break
      }
      if (hasil.jumlahTransaksi !== undefined) break
    }
  }

  return hasil
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

  // Dihitung sebelum penyaringan apa pun, supaya bisa diadu dengan angka yang
  // disebut laporan tentang dirinya sendiri. Kalau yang dibandingkan hanya
  // yang lolos saring, pembacaan yang salah akan selalu tampak cocok.
  let terbaca = 0
  let terbacaRupiah = 0

  const tambah = (e: RealisasiEntry, apa: string) => {
    terbaca += 1
    terbacaRupiah += e.jumlah
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

  const checksum = bacaChecksum(sheets)
  const bedaJumlah = checksum.jumlahTransaksi !== undefined
    && checksum.jumlahTransaksi !== terbaca
  // Selisih satu rupiah bisa datang dari pembulatan tampilan, bukan dari
  // salah baca. Yang dicari di sini kesalahan yang mengubah uangnya.
  const bedaRupiah = checksum.totalRupiah !== undefined
    && Math.abs(checksum.totalRupiah - terbacaRupiah) > 1

  const sebab: string[] = []
  if (bedaJumlah) {
    sebab.push(`laporan menyebut ${checksum.jumlahTransaksi} transaksi,`
      + ` yang terbaca ${terbaca}`)
  }
  if (bedaRupiah) {
    sebab.push(`laporan menyebut total Rp ${Math.round(checksum.totalRupiah ?? 0).toLocaleString('id-ID')},`
      + ` yang terbaca Rp ${Math.round(terbacaRupiah).toLocaleString('id-ID')}`)
  }

  return {
    entri,
    totalRupiah: entri.reduce((s, e) => s + e.jumlah, 0),
    dilewati,
    periksa: {
      checksum,
      terbaca,
      terbacaRupiah,
      cocok: sebab.length === 0,
      selisih: sebab.length ? sebab.join('; ') : undefined,
    },
  }
}

/** "-" di laporan berarti kosong, bukan nama yang sebenarnya. */
function bukanStrip(v: unknown): string | undefined {
  const s = teks(v)
  return s && s !== '-' ? s : undefined
}

/**
 * Kalimat konfirmasi — menyebut nominal, karena itu yang bisa dicocokkan orang.
 *
 * Hasil pencocokan silang selalu ikut disebut ketika tidak cocok, termasuk
 * ketika tidak ada yang bisa dimasukkan. Justru di situ ia paling dibutuhkan:
 * "14 baris dilewati" terdengar seperti keterangan, padahal artinya bisa saja
 * seluruh laporan salah terbaca.
 */
export function kalimatImpor(h: HasilImpor | null | undefined): string {
  const n = h?.entri.length ?? 0
  const lewat = h?.dilewati.length ?? 0
  const nol = (h?.dilewati ?? []).filter(d => d.sebab === 'nominalnya nol').length
  const beda = h?.periksa && !h.periksa.cocok ? h.periksa.selisih : undefined

  if (n < 1) {
    const awal = lewat > 0
      ? nol === lewat && lewat > 0
        ? `Tidak ada yang bisa dimasukkan — ${lewat} baris terbaca bernilai nol.`
        : nol > 0
          ? `Tidak ada yang bisa dimasukkan — ${lewat} baris dilewati (${nol} terbaca bernilai nol, sisanya sudah ada).`
          : `Tidak ada yang bisa dimasukkan — ${lewat} baris sudah ada di aplikasi.`
      : 'Tidak ada transaksi yang terbaca dari berkas ini.'
    return beda
      ? `${awal} Pembacaannya tidak cocok dengan laporan: ${beda}. Jangan dipakai — kirimkan berkasnya untuk diperiksa.`
      : awal
  }

  const rupiah = `Rp ${Math.round(h?.totalRupiah ?? 0).toLocaleString('id-ID')}`
  const bagian = [`${n} transaksi senilai ${rupiah} akan dimasukkan dari laporan Excel.`]
  if (lewat > 0) bagian.push(`${lewat} baris dilewati karena sudah ada atau nominalnya nol.`)
  if (beda) {
    bagian.push(`⚠️ Pembacaannya TIDAK cocok dengan laporan: ${beda}.`
      + ' Cocokkan dulu dengan laporan aslinya sebelum diteruskan.')
  } else if (h?.periksa.checksum.sumber.length) {
    bagian.push(`Sudah dicocokkan dengan ${h.periksa.checksum.sumber.join(' dan ')} — angkanya sama.`)
  }
  bagian.push('Entri yang sekarang ada tidak diubah.')
  return bagian.join(' ')
}
