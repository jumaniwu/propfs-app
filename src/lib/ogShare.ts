// ============================================================
// PropFS — Pratinjau tautan (Open Graph) per jenis halaman
//
// MASALAH: aplikasi ini SPA. Crawler WhatsApp/Telegram/Slack tidak
// menjalankan JavaScript, jadi apa pun tautan yang dikirim — link login tim,
// pendaftaran vendor, purchase order — semuanya menampilkan judul yang sama
// dari index.html: "PropFS — Buat Laporan Feasibility Study Properti".
//
// SOLUSI: setelah build, tiap jenis tautan mendapat berkas HTML sendiri yang
// isinya sama persis dengan index.html (termasuk nama aset yang sudah ber-hash)
// tetapi meta tag-nya diganti. vercel.json mengarahkan rute-rute itu ke
// berkas tersebut; URL di bilah alamat tidak berubah, jadi React Router tetap
// mencocokkan rute aslinya seperti biasa.
//
// Modul ini sengaja bebas DOM & impor Node supaya bisa diuji langsung.
// ============================================================

// Ekstensi .ts ditulis eksplisit karena modul ini dimuat langsung oleh
// test Node (lihat src/engine/siteplan untuk pola yang sama).
import { POLA_TAUTAN, type JenisTautan } from './tautanPendek.ts'

export interface HalamanBagikan {
  /** Nama berkas keluaran, relatif terhadap dist/ (tanpa awalan share/). */
  berkas: string
  /**
   * Pola rute Vercel yang diarahkan ke berkas ini. Halaman bertoken punya
   * lebih dari satu: jalur pendek untuk tautan baru, jalur panjang agar
   * tautan yang sudah tersebar tetap mendapat pratinjau yang benar.
   */
  rute: string
  /** Jenis tautan publik; kosong untuk halaman tanpa token. */
  jenis?: JenisTautan
  judul: string
  deskripsi: string
  /** Nama berkas gambar di /og/. */
  gambar: string
}

export const SITUS = 'https://propfs.id'

/**
 * Judul sengaja diawali nama tindakannya, bukan nama produk, karena di daftar
 * chat WhatsApp hanya beberapa kata pertama yang terbaca.
 */
export const HALAMAN_BAGIKAN: HalamanBagikan[] = [
  {
    berkas: 'tim-masuk',
    rute: '/tim/masuk',
    judul: 'Login Tim — PropFS Kontraktor AI',
    deskripsi: 'Masuk dengan Kode Perusahaan dan User ID dari admin perusahaan Anda untuk mengakses proyek, laporan lapangan, dan material.',
    gambar: 'tim.png',
  },
  {
    berkas: 'vendor-daftar',
    jenis: 'vendor_daftar',
    rute: '/vendor/daftar/:token',
    judul: 'Pendaftaran Vendor — PropFS Kontraktor AI',
    deskripsi: 'Daftarkan usaha Anda sebagai vendor: isi profil, nomor WhatsApp, daftar barang beserta harga jual dan syarat pembayaran.',
    gambar: 'vendor.png',
  },
  {
    berkas: 'vendor-item',
    jenis: 'vendor_item',
    rute: '/vendor/item/:token',
    judul: 'Perbarui Daftar Barang & Harga — PropFS',
    deskripsi: 'Perbarui barang yang Anda jual beserta harganya agar pesanan yang masuk selalu memakai harga terbaru.',
    gambar: 'vendor.png',
  },
  {
    berkas: 'po',
    jenis: 'po',
    rute: '/po/:token',
    judul: 'Purchase Order — PropFS Kontraktor AI',
    deskripsi: 'Lihat rincian pesanan pembelian, syarat pembayaran, dan unduh PDF-nya. Dokumen sudah ditandatangani dan disetujui secara digital.',
    gambar: 'po.png',
  },
  {
    berkas: 'lapor',
    jenis: 'lapor',
    rute: '/lapor/:token',
    judul: 'Laporan Harian Lapangan — PropFS',
    deskripsi: 'Isi laporan kegiatan harian, pemakaian material, dan permintaan material langsung dari HP. Tanpa perlu login.',
    gambar: 'lapangan.png',
  },
  {
    berkas: 'progress',
    jenis: 'progress',
    rute: '/progress/:token',
    judul: 'Progres Proyek — PropFS Kontraktor AI',
    deskripsi: 'Pantau progres pekerjaan harian lengkap dengan foto lapangan, langsung dari HP Anda.',
    gambar: 'lapangan.png',
  },
  {
    berkas: 'spk-sign',
    jenis: 'spk_sign',
    rute: '/spk/sign/:token',
    judul: 'Tanda Tangan SPK Digital — PropFS',
    deskripsi: 'Baca Surat Perintah Kerja dan tanda tangani secara digital langsung dari HP. Sah dan tersimpan otomatis.',
    gambar: 'spk.png',
  },
  {
    berkas: 'opname',
    jenis: 'opname',
    rute: '/opname/isi/:token',
    judul: 'Form Opname Pekerjaan — PropFS',
    deskripsi: 'Isi realisasi volume pekerjaan di lapangan. Hasilnya langsung masuk ke laporan proyek.',
    gambar: 'lapangan.png',
  },
]

/** Ganti isi sebuah tag <title>. */
function gantiJudul(html: string, judul: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${lolos(judul)}</title>`)
}

/**
 * Ganti atribut content pada satu meta tag, dikenali lewat name= atau
 * property=. Bila tagnya tidak ada, HTML dikembalikan apa adanya — lebih baik
 * kehilangan satu tag daripada merusak seluruh halaman.
 */
function gantiMeta(html: string, kunci: string, nilai: string): string {
  const pola = new RegExp(
    `(<meta\\s+(?:name|property)=["']${kunci.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\s+content=["'])[\\s\\S]*?(["'][^>]*>)`,
    'i',
  )
  return html.replace(pola, `$1${lolos(nilai)}$2`)
}

/** Amankan karakter yang bisa memutus atribut HTML. */
function lolos(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Terapkan meta satu halaman ke HTML hasil build. Yang diganti hanya judul,
 * deskripsi, dan tag Open Graph/Twitter — seluruh sisanya (aset ber-hash,
 * font, analytics) dibiarkan utuh supaya aplikasinya tetap berjalan sama.
 */
export function terapkanMeta(html: string, h: HalamanBagikan, situs = SITUS): string {
  const gambar = `${situs}/og/${h.gambar}`
  let out = gantiJudul(html, h.judul)
  out = gantiMeta(out, 'description', h.deskripsi)
  out = gantiMeta(out, 'og:title', h.judul)
  out = gantiMeta(out, 'og:description', h.deskripsi)
  out = gantiMeta(out, 'og:image', gambar)
  out = gantiMeta(out, 'og:image:alt', h.judul)
  out = gantiMeta(out, 'og:url', `${situs}${h.rute.replace(/\/:.*$/, '')}`)
  out = gantiMeta(out, 'twitter:title', h.judul)
  out = gantiMeta(out, 'twitter:description', h.deskripsi)
  out = gantiMeta(out, 'twitter:image', gambar)
  // Halaman bertoken bersifat pribadi — jangan sampai terindeks mesin pencari.
  out = gantiMeta(out, 'robots', 'noindex, nofollow')
  return out
}

/**
 * Semua jalur yang harus mengarah ke berkas pratinjau sebuah halaman.
 * Halaman bertoken menghasilkan dua: jalur pendek dan jalur lama.
 */
export function ruteHalaman(h: HalamanBagikan): string[] {
  if (!h.jenis) return [h.rute]
  const { pendek, lama } = POLA_TAUTAN[h.jenis]
  const jalur = pendek === lama ? [pendek] : [pendek, lama]
  return jalur.map(j => `${j}/:token`)
}

/** Rewrite Vercel: rute → berkas HTML hasil build. */
export function rewritesVercel(): Array<{ source: string; destination: string }> {
  return HALAMAN_BAGIKAN.flatMap(h =>
    ruteHalaman(h).map(source => ({ source, destination: `/share/${h.berkas}.html` })))
}
