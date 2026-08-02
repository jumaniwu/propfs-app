// ============================================================
// PropFS — Marcom: menyiapkan foto & video proyek untuk media sosial
//
// Kontraktor punya bahan promosi terbaik yang bisa dibayangkan — foto progres
// proyeknya sendiri — dan hampir tidak pernah memakainya, karena antara "foto
// di HP" dan "postingan yang layak tayang" ada pekerjaan yang membosankan:
// memotong ke ukuran yang benar, menempel logo, mengetik caption, menempel
// nomor telepon, mengulang semuanya untuk Feed dan Story.
//
// Modul ini memuat bagian yang bisa dihitung tanpa layar: ukuran & tata letak
// tiap format, penyusunan caption, dan perapian nomor kontak. Menggambarnya
// ada di `marcomRender.ts`, kata-katanya di `marcomAi.ts`.
//
// Dua hal yang sengaja diputuskan di sini:
//
//   • Logo dan kontak TIDAK diketik ulang. Keduanya diambil dari Profil
//     Perusahaan yang sudah dipakai kop laporan dan PDF. Satu tempat, satu
//     kebenaran — nomor yang berubah tidak menyisakan postingan lama yang
//     menyesatkan.
//   • Caption SELALU ditutup nomor kontak. Postingan promosi tanpa cara
//     menghubungi hanyalah pengumuman.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import { nomorWaInternasional } from './waLink.ts'

// ── Format keluaran ─────────────────────────────────────────────────────────

export type FormatMarcom = 'feed' | 'story' | 'lanskap'

export interface UkuranFormat {
  label: string
  /** Untuk apa format ini, dalam bahasa pemakainya. */
  untuk: string
  lebar: number
  tinggi: number
}

/**
 * Ukuran piksel mengikuti anjuran platform, bukan angka karangan: 1080 px sisi
 * pendek adalah yang benar-benar dipakai Instagram & TikTok. Lebih besar hanya
 * memperlambat unggahan tanpa menambah ketajaman — gambarnya tetap dikecilkan
 * di sisi mereka.
 */
export const FORMAT_MARCOM: Record<FormatMarcom, UkuranFormat> = {
  feed: { label: 'Feed 1:1', untuk: 'Instagram & Facebook feed', lebar: 1080, tinggi: 1080 },
  story: { label: 'Story 9:16', untuk: 'IG/WA Story, TikTok, Reels', lebar: 1080, tinggi: 1920 },
  lanskap: { label: 'Lanskap 16:9', untuk: 'YouTube, LinkedIn, situs web', lebar: 1920, tinggi: 1080 },
}

export const URUTAN_FORMAT: FormatMarcom[] = ['feed', 'story', 'lanskap']

// ── Template ────────────────────────────────────────────────────────────────

export type TemplateMarcom = 'sorot' | 'klasik'

export const TEMPLATE_MARCOM: Record<TemplateMarcom, { label: string; untuk: string }> = {
  sorot: {
    label: 'Sorot Foto',
    untuk: 'Logo di tengah atas, pita tipis di bawah — fotonya yang bicara',
  },
  klasik: {
    label: 'Judul Besar',
    untuk: 'Nama proyek dicetak besar di bawah, untuk foto yang perlu penjelasan',
  },
}

export const URUTAN_TEMPLATE: TemplateMarcom[] = ['sorot', 'klasik']

// ── Tata letak ──────────────────────────────────────────────────────────────

export interface TataLetak {
  template: TemplateMarcom
  lebar: number
  tinggi: number
  /** Jarak aman dari tepi. */
  tepi: number
  /** Tinggi area gelap di bawah: pita tipis pada 'sorot', gradasi tinggi pada 'klasik'. */
  tinggiFooter: number
  /** `tengah` = logo dipusatkan mendatar dan digambar tanpa alas putih. */
  logo: { x: number; y: number; maks: number; tengah: boolean }
  /** Semboyan di bawah logo — hanya dipakai template 'sorot'. */
  tagline: { y: number; ukuran: number }
  /** Baris keterangan proyek di dalam pita bawah — hanya 'sorot'. */
  garisProyek: { y: number; ukuran: number }
  /**
   * `yBawah` adalah garis dasar baris TERAKHIR judul, bukan baris pertama.
   * Jumlah barisnya baru diketahui setelah teksnya diukur kanvas, jadi yang
   * bisa dipatok dari awal hanyalah ujung bawahnya. Hanya dipakai 'klasik'.
   */
  judul: { x: number; yBawah: number; ukuran: number; tinggiBaris: number; lebarMaks: number }
  /** `y` = garis dasar baris kontak TERAKHIR. */
  kontak: { x: number; y: number; ukuran: number; tinggiBaris: number }
  /**
   * Garis dasar keterangan kecil pada keadaan TERPADAT (judul dua baris) —
   * yaitu posisi tertinggi yang mungkin dicapainya. Penggambar menghitung
   * posisi sebenarnya dari jumlah baris judul yang benar-benar terpakai;
   * angka di sini yang dipakai memastikan bahkan keadaan terpadat pun masih
   * jatuh di dalam pita gelap. Hanya dipakai 'klasik'.
   */
  keterangan: { x: number; y: number; ukuran: number }
  /** Ukuran font untuk teks kecil. */
  ukuranKecil: number
}

/**
 * Tata letak satu format & template.
 *
 * Semua ukuran diturunkan dari sisi pendek, bukan ditulis satu-satu per format.
 * Angka yang ditulis manual per format pasti akan berbeda proporsinya suatu
 * hari — dan ketidakcocokan itu baru terlihat setelah postingannya terbit.
 *
 * Story diberi jarak bawah lebih besar pada kedua template: sepertiga bawah
 * layar Story tertutup kolom balasan dan tombol platform, jadi teks penting
 * harus naik.
 */
export function tataLetak(format: FormatMarcom, template: TemplateMarcom = 'sorot'): TataLetak {
  const { lebar, tinggi } = FORMAT_MARCOM[format]
  const pendek = Math.min(lebar, tinggi)
  const tepi = Math.round(pendek * 0.055)
  const bawahAman = format === 'story' ? Math.round(tinggi * 0.10) : tepi

  const ukuranKecil = Math.round(pendek * 0.026)
  const ukuranKontak = Math.round(pendek * 0.032)

  if (template === 'sorot') {
    // Fotonya yang bicara: yang menutupi gambar hanya pita tipis di paling
    // bawah, bukan sepertiga layar. Logo berdiri sendiri di tengah atas —
    // langit atau dinding di sana hampir selalu polos, jadi logonya terbaca
    // tanpa perlu kotak putih yang membuatnya tampak seperti stiker tempelan.
    const ukuranProyek = Math.round(pendek * 0.030)
    const tinggiBar = Math.round(bawahAman + ukuranProyek * 1.5 + ukuranKontak * 1.7)
    const atasBar = tinggi - tinggiBar
    const maksLogo = Math.round(pendek * 0.20)

    return {
      template,
      lebar,
      tinggi,
      tepi,
      tinggiFooter: tinggiBar,
      logo: { x: Math.round(lebar / 2), y: Math.round(pendek * 0.05), maks: maksLogo, tengah: true },
      tagline: { y: Math.round(pendek * 0.05) + maksLogo + Math.round(ukuranKecil * 1.4), ukuran: ukuranKecil },
      garisProyek: { y: atasBar + Math.round(ukuranProyek * 1.5), ukuran: ukuranProyek },
      kontak: {
        x: tepi,
        y: tinggi - bawahAman - Math.round(ukuranKontak * 0.2),
        ukuran: ukuranKontak,
        tinggiBaris: Math.round(ukuranKontak * 1.35),
      },
      // Tidak dipakai template ini; diisi nilai yang tetap masuk akal supaya
      // pemanggil yang lalai tidak menggambar di luar bingkai.
      judul: {
        x: tepi, yBawah: atasBar - tepi, ukuran: Math.round(pendek * 0.052),
        tinggiBaris: Math.round(pendek * 0.052 * 1.18), lebarMaks: lebar - tepi * 2,
      },
      keterangan: { x: tepi, y: atasBar - tepi * 3, ukuran: ukuranKecil },
      ukuranKecil,
    }
  }

  // ── 'klasik' ──────────────────────────────────────────────────────────────
  const rasioFooter = format === 'story' ? 0.30 : 0.26
  const tinggiFooter = Math.round(tinggi * rasioFooter)
  const ukuranJudul = Math.round(pendek * 0.052)

  // Tumpukan disusun DARI BAWAH KE ATAS: kontak dipatok ke tepi bawah, judul
  // berdiri di atasnya, keterangan di atas judul. Menaruh judul pada koordinat
  // tetap terlihat benar untuk satu baris lalu menabrak nomor kontak begitu
  // nama proyeknya cukup panjang untuk pecah jadi dua baris — dan tabrakan itu
  // baru ketahuan setelah gambarnya jadi.
  const tinggiBarisKontak = Math.round(ukuranKontak * 1.35)
  const tinggiBarisJudul = Math.round(ukuranJudul * 1.18)

  // Dua baris kontak adalah keadaan terpadat yang mungkin (lihat barisKontak).
  const atasKontak = (tinggi - bawahAman) - tinggiBarisKontak - ukuranKontak
  const judulYBawah = atasKontak - Math.round(ukuranKecil * 0.8)

  return {
    template,
    lebar,
    tinggi,
    tepi,
    tinggiFooter,
    logo: { x: tepi, y: tepi, maks: Math.round(pendek * 0.14), tengah: false },
    tagline: { y: tepi + Math.round(pendek * 0.14) + ukuranKecil * 2, ukuran: ukuranKecil },
    garisProyek: { y: judulYBawah, ukuran: ukuranKecil },
    judul: {
      x: tepi,
      yBawah: judulYBawah,
      ukuran: ukuranJudul,
      tinggiBaris: tinggiBarisJudul,
      lebarMaks: lebar - tepi * 2,
    },
    kontak: { x: tepi, y: tinggi - bawahAman, ukuran: ukuranKontak, tinggiBaris: tinggiBarisKontak },
    keterangan: {
      x: tepi,
      y: judulYBawah - tinggiBarisJudul - ukuranJudul - Math.round(ukuranKecil * 0.55),
      ukuran: ukuranKecil,
    },
    ukuranKecil,
  }
}

/**
 * Satu baris keterangan proyek untuk pita bawah template 'sorot'.
 *
 * Bentuknya mengikuti yang lazim dipakai kontraktor di Instagram:
 * "Project: Boutique Hotel at Nagoya | Civil, Architecture and MEP works".
 * Bagian yang kosong dilewati, tanpa meninggalkan pemisah menggantung.
 */
export function garisProyek(nama?: unknown, lingkup?: unknown): string {
  const n = String(nama ?? '').trim()
  const l = String(lingkup ?? '').trim()
  if (!n && !l) return ''
  if (!n) return l
  return l ? `Project: ${n} | ${l}` : `Project: ${n}`
}

// ── Kontak dari Profil Perusahaan ───────────────────────────────────────────

export interface ProfilMarcom {
  nama?: string | null
  logo?: string | null
  alamat?: string | null
  telepon?: string | null
  email?: string | null
  website?: string | null
}

/**
 * Nomor telepon dalam bentuk yang enak dibaca: +62 812-3456-7890.
 *
 * Nomor yang tidak bisa ditafsirkan dikembalikan APA ADANYA, bukan dibuang dan
 * bukan ditebak. Nomor kantor "(0778) 123456" tetap berguna bagi pembacanya
 * walau bukan format seluler; membuangnya justru menghapus satu-satunya cara
 * menghubungi.
 */
export function nomorTampil(input: unknown): string {
  const mentah = String(input ?? '').trim()
  if (!mentah) return ''
  const intl = nomorWaInternasional(mentah)
  if (!intl) return mentah

  if (!intl.startsWith('62')) return `+${intl}`

  // Pengelompokan yang lazim di Indonesia: 812-3456-7890 — tiga dulu, lalu
  // empat-empat. Pengelompokan serakah "3 sampai 4" menghasilkan 8123-4567-890,
  // yang terbaca salah oleh orang yang menyalinnya dengan tangan.
  const sisa = intl.slice(2)
  const bagian = [sisa.slice(0, 3)]
  for (let i = 3; i < sisa.length; i += 4) bagian.push(sisa.slice(i, i + 4))

  // Sisa satu-dua angka di ujung disatukan ke kelompok sebelumnya. Nomor
  // kantor "778 123456" akan berakhir "…-56" bila dipaksa empat-empat, dan
  // potongan sependek itu terbaca seperti nomornya salah ketik.
  if (bagian.length > 1 && bagian[bagian.length - 1].length <= 2) {
    const ekor = bagian.pop()!
    bagian[bagian.length - 1] += ekor
  }
  return `+62 ${bagian.filter(Boolean).join('-')}`
}

/**
 * Baris kontak untuk footer gambar.
 *
 * Dibatasi supaya tidak berubah menjadi kartu nama: yang menghentikan jempol
 * orang adalah fotonya, bukan alamat lengkap dengan kode pos. Nomor telepon
 * selalu didahulukan — itulah satu-satunya baris yang benar-benar diperlukan.
 */
export function barisKontak(profil: ProfilMarcom = {}, maks = 2): string[] {
  const baris: string[] = []
  const telp = nomorTampil(profil.telepon)
  if (telp) baris.push(telp)

  const web = String(profil.website ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const email = String(profil.email ?? '').trim()
  if (web) baris.push(web)
  else if (email) baris.push(email)

  return baris.slice(0, Math.max(1, maks))
}

/** Nama yang tercetak di gambar. Kosong bila perusahaan belum diisi. */
export function namaTampil(profil: ProfilMarcom = {}): string {
  return String(profil.nama ?? '').trim()
}

/**
 * Apakah profil perusahaan cukup lengkap untuk membuat materi promosi.
 *
 * Bukan sekadar validasi: pemakainya perlu diberi tahu APA yang kurang dan di
 * mana mengisinya, bukan ditolak dengan "data tidak lengkap".
 */
export function periksaProfil(profil: ProfilMarcom = {}): { siap: boolean; kurang: string[] } {
  const kurang: string[] = []
  if (!namaTampil(profil)) kurang.push('Nama perusahaan')
  if (!nomorTampil(profil.telepon)) kurang.push('Nomor telepon')
  if (!String(profil.logo ?? '').trim()) kurang.push('Logo')
  // Logo boleh kosong — namanya tetap bisa dicetak sebagai teks. Yang benar-
  // benar menghentikan pekerjaan hanya nama dan nomor.
  return { siap: !!namaTampil(profil) && !!nomorTampil(profil.telepon), kurang }
}

// ── Caption ─────────────────────────────────────────────────────────────────

export interface BagianCaption {
  /** Kalimat utama — dari AI atau diketik sendiri. */
  teks?: string | null
  /** Ajakan bertindak. */
  cta?: string | null
  hashtag?: unknown
  profil?: ProfilMarcom
}

export const CTA_BAWAAN = 'Konsultasi gratis untuk proyek Anda:'

/**
 * Susun caption lengkap, selalu ditutup nomor kontak.
 *
 * Urutannya disengaja: cerita dulu, ajakan, kontak, baru hashtag. Hashtag di
 * paling bawah supaya tidak memutus kalimat, dan kontak DI ATAS hashtag supaya
 * tidak ikut terpotong oleh "selengkapnya" pada caption panjang.
 */
export function susunCaption(bagian: BagianCaption = {}): string {
  const blok: string[] = []

  const teks = String(bagian.teks ?? '').trim()
  if (teks) blok.push(teks)

  const nama = namaTampil(bagian.profil ?? {})
  const telp = nomorTampil(bagian.profil?.telepon)
  if (telp) {
    const cta = String(bagian.cta ?? '').trim() || CTA_BAWAAN
    blok.push(`${cta}\n📞 ${telp}${nama ? `\n${nama}` : ''}`)
  }

  const tag = bersihkanHashtag(bagian.hashtag)
  if (tag.length) blok.push(tag.join(' '))

  return blok.join('\n\n')
}

/**
 * Rapikan hashtag dari bentuk apa pun (teks dipisah koma/spasi, atau larik).
 *
 * Yang kembar dibuang tanpa memandang huruf besar-kecil: Instagram
 * memperlakukan #Renovasi dan #renovasi sebagai satu, jadi menampilkan keduanya
 * hanya memakan tempat.
 */
export function bersihkanHashtag(input: unknown, maks = 12): string[] {
  const mentah = Array.isArray(input)
    ? input.map(x => String(x ?? ''))
    : String(input ?? '').split(/[\s,]+/)

  const keluar: string[] = []
  const dilihat = new Set<string>()
  for (const m of mentah) {
    const bersih = m.trim().replace(/^#+/, '').replace(/[^0-9a-zA-Z_]/g, '')
    if (!bersih) continue
    const kunci = bersih.toLowerCase()
    if (dilihat.has(kunci)) continue
    dilihat.add(kunci)
    keluar.push(`#${bersih}`)
    if (keluar.length >= maks) break
  }
  return keluar
}

// ── Teks di atas gambar ─────────────────────────────────────────────────────

/**
 * Pecah teks menjadi baris yang muat.
 *
 * Pengukurannya DISUNTIKKAN, bukan dihitung di sini: lebar sebenarnya hanya
 * diketahui kanvas, dan menebaknya dari jumlah karakter akan meleset jauh untuk
 * huruf seperti "i" dan "W". Dengan begitu logikanya tetap bisa diuji di Node.
 *
 * Kata yang lebih panjang dari satu baris tidak dipaksa dipotong di tengah —
 * ia diberi barisnya sendiri dan dibiarkan meluber. Memotongnya menghasilkan
 * kata yang tidak bisa dibaca, dan itu lebih buruk daripada satu baris yang
 * sedikit terlalu lebar.
 */
export function bungkusBaris(
  teks: unknown,
  muat: (baris: string) => boolean,
  maksBaris = 4,
): string[] {
  const kata = String(teks ?? '').trim().split(/\s+/).filter(Boolean)
  if (!kata.length) return []

  const baris: string[] = []
  let kini = ''
  for (const k of kata) {
    const coba = kini ? `${kini} ${k}` : k
    if (muat(coba) || !kini) {
      kini = coba
    } else {
      baris.push(kini)
      kini = k
      if (baris.length >= maksBaris) break
    }
  }
  if (kini && baris.length < maksBaris) baris.push(kini)

  if (baris.length >= maksBaris && kata.length) {
    // Ada sisa yang tidak muat: beri tanda, jangan diam-diam dibuang.
    const terpakai = baris.join(' ').split(/\s+/).length
    if (terpakai < kata.length) baris[baris.length - 1] = `${baris[baris.length - 1]}…`
  }
  return baris.slice(0, maksBaris)
}

/** Judul singkat yang pantas dicetak di gambar. */
export function judulGambar(teks: unknown, maks = 60): string {
  const t = String(teks ?? '').trim().replace(/\s+/g, ' ')
  if (t.length <= maks) return t
  return `${t.slice(0, maks - 1).trimEnd()}…`
}

// ── Berkas ──────────────────────────────────────────────────────────────────

/** Nama berkas yang rapi & aman untuk semua sistem berkas. */
export function namaBerkas(
  nama: unknown,
  format: FormatMarcom,
  ext: string,
  sekarang: Date = new Date(),
): string {
  const dasar = String(nama ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'promosi'
  const d = Number.isNaN(sekarang.getTime()) ? new Date() : sekarang
  const tgl = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const e = String(ext ?? '').replace(/^\./, '') || 'png'
  return `${dasar}-${format}-${tgl}.${e}`
}

// ── Video ───────────────────────────────────────────────────────────────────

/** Lama satu foto tampil dalam video slideshow, dalam milidetik. */
export const DURASI_PER_FOTO = 2500

/** Lama seluruh video dari sejumlah foto. */
export function durasiVideo(jumlahFoto: number, perFoto = DURASI_PER_FOTO): number {
  const n = Math.max(0, Math.floor(Number(jumlahFoto) || 0))
  return n * Math.max(200, Math.floor(Number(perFoto) || DURASI_PER_FOTO))
}

/**
 * Foto keberapa yang tampil pada milidetik tertentu, beserta kemajuannya.
 *
 * `pudar` dipakai untuk transisi lembut antar foto; nilainya 0..1 pada 300 ms
 * pertama tiap foto.
 */
export function fotoPadaWaktu(
  ms: number,
  jumlah: number,
  perFoto = DURASI_PER_FOTO,
): { indeks: number; pudar: number } {
  const n = Math.max(0, Math.floor(Number(jumlah) || 0))
  if (n === 0) return { indeks: 0, pudar: 1 }
  const d = Math.max(200, Math.floor(Number(perFoto) || DURASI_PER_FOTO))
  const t = Math.max(0, Number(ms) || 0)
  const indeks = Math.min(n - 1, Math.floor(t / d))
  const dalam = t - indeks * d
  const lamaPudar = Math.min(300, d / 2)
  return { indeks, pudar: Math.min(1, dalam / lamaPudar) }
}
