// ============================================================
// PropFS — Menemukan biaya yang tercatat dua kali
//
// CACAT YANG DIPERBAIKI BERKAS INI, DAN SEBABNYA.
//
// Pembanding sebelumnya menyamakan nomor nota setelah huruf besar-kecil dan
// spasi berlebih dirapikan. Itu tidak cukup: nota yang sama diketik manusia
// sebagai "A 40637" dan dibaca AI sebagai "A40637". Satu spasi, dan keduanya
// dianggap dua nota berbeda — lalu pembelian yang sama masuk dua kali.
//
// Itu benar-benar terjadi: 42 transaksi menjadi 46, dan material Rp 69,3 juta
// menjadi Rp 77,4 juta hanya karena empat baris kembar. Biaya ganda ikut ke
// laba rugi, ke neraca, dan ke perbandingan terhadap RAB — dan tidak ada yang
// menyadarinya sampai seseorang menghitung ulang dengan tangan.
//
// Karena itu penyamaan nomor nota di sini MEMBUANG SELURUH aksara yang bukan
// huruf/angka. "A 40637", "A-40637", dan "A40637" menjadi satu.
//
// DUA TINGKAT KEYAKINAN, DENGAN AKIBAT YANG BERBEDA:
//
//   • `pasti`  — nomor nota sama DAN nominal sama. Dipakai untuk MENOLAK
//     usulan baru secara otomatis: menawarkan sesuatu yang jelas kembar hanya
//     mengundang kesalahan.
//   • `mungkin` — tanggal + nominal + toko/barang sama, tanpa nomor nota yang
//     menguatkan. TIDAK PERNAH dihapus sendiri: dua kotak paku Rp 120.000 dari
//     toko yang sama pada hari yang sama memang bisa dibeli dua kali, dan
//     menghapus salah satunya berarti menghilangkan biaya yang nyata.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi.ts'

const teks = (v: unknown) => String(v ?? '').trim()

/**
 * Nomor nota yang bisa dibandingkan.
 *
 * Seluruh aksara selain huruf dan angka dibuang: spasi, strip, garis miring,
 * dan titik dipakai berbeda-beda oleh setiap toko dan setiap orang yang
 * mengetiknya. "00104/CR/GBS/08/2026" → "00104crgbs082026".
 */
export function normalNota(v: unknown): string {
  return teks(v).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Nama toko/barang yang bisa dibandingkan. Spasi dibuang, sama alasannya. */
export function normalNama(v: unknown): string {
  return teks(v).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Nominal dibulatkan ke rupiah — pembulatan sen bukan pembeda. */
const nominal = (v: unknown) => Math.round(Number(v) || 0)

export type Keyakinan = 'pasti' | 'mungkin'

export interface PasanganDuplikat {
  /** Yang lebih dulu tercatat; inilah yang dipertahankan. */
  asli: RealisasiEntry
  /** Yang belakangan; inilah yang ditawarkan untuk dihapus. */
  kembar: RealisasiEntry
  keyakinan: Keyakinan
  /** Kalimat yang menerangkan MENGAPA keduanya dianggap kembar. */
  sebab: string
}

/**
 * Apakah dua entri adalah kejadian yang sama.
 *
 * Nominal harus selalu sama. Tanpa syarat itu, satu nota yang dicicil
 * pencatatannya per barang akan dikira kembar dengan totalnya.
 */
export function bandingkanEntri(
  a: Pick<RealisasiEntry, 'tanggal' | 'jumlah' | 'nomorNota' | 'namaSupplier' | 'namaMaterial' | 'volume'>,
  b: typeof a,
): { kembar: boolean; keyakinan: Keyakinan; sebab: string } {
  const tidak = { kembar: false, keyakinan: 'mungkin' as Keyakinan, sebab: '' }
  const nilai = nominal(a?.jumlah)
  if (nilai <= 0 || nilai !== nominal(b?.jumlah)) return tidak

  const notaA = normalNota(a?.nomorNota)
  const notaB = normalNota(b?.nomorNota)
  if (notaA && notaA === notaB) {
    return {
      kembar: true, keyakinan: 'pasti',
      sebab: `Nomor nota & nominalnya sama persis (${teks(a?.nomorNota)}).`,
    }
  }
  // Nomor nota yang BERBEDA adalah bukti keduanya memang dua kejadian.
  // Melanjutkan ke dugaan berikutnya akan menghapus pembelian yang sah.
  if (notaA && notaB && notaA !== notaB) return tidak

  if (teks(a?.tanggal) !== teks(b?.tanggal) || !teks(a?.tanggal)) return tidak

  const tokoA = normalNama(a?.namaSupplier)
  const tokoB = normalNama(b?.namaSupplier)
  const barangA = normalNama(a?.namaMaterial)
  const barangB = normalNama(b?.namaMaterial)

  if (tokoA && tokoA === tokoB) {
    return {
      kembar: true, keyakinan: 'mungkin',
      sebab: `Tanggal, nominal, dan tokonya sama (${teks(a?.namaSupplier)}).`,
    }
  }
  if (barangA && barangA === barangB) {
    return {
      kembar: true, keyakinan: 'mungkin',
      sebab: `Tanggal, nominal, dan nama barangnya sama (${teks(a?.namaMaterial)}).`,
    }
  }
  return tidak
}

/**
 * Semua pasangan kembar di dalam buku pengeluaran.
 *
 * Tiap entri hanya dipasangkan SEKALI. Tanpa itu, tiga baris kembar
 * menghasilkan tiga pasangan dan menghapus semuanya akan menghapus biaya yang
 * memang ada — yang dipertahankan selalu yang tercatat paling dulu.
 */
export function cariDuplikat(entries: RealisasiEntry[] | null | undefined): PasanganDuplikat[] {
  const daftar = (entries ?? []).filter(Boolean)
  const sudah = new Set<string>()
  const hasil: PasanganDuplikat[] = []

  for (let i = 0; i < daftar.length; i++) {
    if (sudah.has(daftar[i].id)) continue
    for (let j = i + 1; j < daftar.length; j++) {
      if (sudah.has(daftar[j].id)) continue
      const c = bandingkanEntri(daftar[i], daftar[j])
      if (!c.kembar) continue
      hasil.push({
        asli: daftar[i], kembar: daftar[j],
        keyakinan: c.keyakinan, sebab: c.sebab,
      })
      sudah.add(daftar[j].id)
    }
  }
  return hasil
}

/** Yang jelas kembar; inilah yang aman ditawarkan untuk dihapus sekaligus. */
export function duplikatPasti(d: PasanganDuplikat[]): PasanganDuplikat[] {
  return d.filter(p => p.keyakinan === 'pasti')
}

/** Berapa rupiah yang terhitung dua kali. */
export function nilaiDuplikat(d: PasanganDuplikat[]): number {
  return d.reduce((s, p) => s + nominal(p.kembar.jumlah), 0)
}

export function ringkasDuplikat(d: PasanganDuplikat[]): string {
  if (!d.length) return ''
  const pasti = duplikatPasti(d).length
  const nilai = nilaiDuplikat(d)
  const bagian = [`${d.length} baris terlihat kembar`]
  if (pasti) bagian.push(`${pasti} di antaranya sama persis`)
  bagian.push(`total Rp ${nilai.toLocaleString('id-ID')} berpotensi terhitung dua kali`)
  return `${bagian.join(', ')}.`
}

/**
 * Entri baru yang BELUM ada di buku.
 *
 * Dipakai sebelum menyimpan hasil bacaan AI: nota yang sudah pernah difoto dan
 * dicatat sering difoto lagi — oleh orang yang berbeda, atau oleh orang yang
 * sama karena lupa. Menyaringnya di sini jauh lebih murah daripada mencarinya
 * kembali setelah laporan keuangannya salah.
 *
 * Hanya yang PASTI kembar yang disaring. Yang cuma "mungkin" tetap dimasukkan
 * lalu muncul di daftar tinjauan — menolak diam-diam pembelian yang sah jauh
 * lebih merugikan daripada satu baris yang perlu diperiksa.
 */
export function saringEntriBaru(
  baru: RealisasiEntry[] | null | undefined,
  lama: RealisasiEntry[] | null | undefined,
): { diterima: RealisasiEntry[]; ditolak: RealisasiEntry[] } {
  const diterima: RealisasiEntry[] = []
  const ditolak: RealisasiEntry[] = []
  // Yang baru ikut dibandingkan satu sama lain: satu foto nota bisa terbaca
  // menghasilkan dua baris yang sama bila notanya memuat barang kembar.
  const pembanding = [...(lama ?? [])]

  for (const b of baru ?? []) {
    if (!b) continue
    const kembar = pembanding.some(l => {
      const c = bandingkanEntri(b, l)
      return c.kembar && c.keyakinan === 'pasti'
    })
    if (kembar) ditolak.push(b)
    else { diterima.push(b); pembanding.push(b) }
  }
  return { diterima, ditolak }
}
