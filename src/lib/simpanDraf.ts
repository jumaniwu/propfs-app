// ============================================================
// PropFS — Isian form tidak boleh hilang karena halaman dimuat ulang
//
// Yang dilaporkan: "saya refresh, semua data hilang — dia tidak auto simpan
// ke database tiap saya isi form". Ditelusuri, penyimpanannya memang ada,
// tetapi rusak di empat tempat sekaligus:
//
//   1. `setTimeout(save, 800)` dipanggil pada SETIAP perubahan tanpa pernah
//      membatalkan yang sebelumnya. Mengetik dua puluh huruf menjadwalkan dua
//      puluh penyimpanan, dan semuanya berangkat. Yang menang bukan yang
//      terakhir DIKIRIM melainkan yang terakhir SAMPAI — sehingga muatan lama
//      bisa mendarat sesudah yang baru dan menimpanya. Itu bukan sekadar
//      boros; itu kehilangan data.
//
//   2. Hasil `update()` ke database tidak pernah diperiksa. Ditolak RLS,
//      barisnya tidak ada, jaringan putus — ketiganya berakhir sama: tidak
//      terjadi apa-apa, tanpa satu pun tanda. Penanda "sedang menyimpan"
//      bahkan tetap padam seolah semuanya beres.
//
//   3. `update` pada baris yang TIDAK ADA mengenai nol baris dan TIDAK
//      dianggap galat oleh Postgres. Proyek yang gagal dibuat karena itu
//      menerima setiap penyimpanan berikutnya dengan diam.
//
//   4. Tidak ada salinan lokal sama sekali. Ketika ketiga hal di atas gagal,
//      satu-satunya salinan isian ada di memori halaman — dan memuat ulang
//      menghapusnya.
//
// Modul ini menyediakan bagian yang bisa diuji tanpa DOM & tanpa jaringan:
// penundaan yang benar-benar membatalkan pendahulunya, dan draf lokal yang
// menjadi jaring pengaman ketika penyimpanan ke server gagal.
// ============================================================

/**
 * Jeda sebelum isian dikirim ke server.
 *
 * Delapan ratus milidetik: cukup lama untuk tidak mengirim satu permintaan
 * per huruf, cukup singkat sehingga yang berpindah halaman sedetik kemudian
 * tetap membawa perubahannya.
 */
export const JEDA_SIMPAN_MS = 800

export interface Penunda {
  /** Jadwalkan; jadwal sebelumnya DIBATALKAN. */
  jadwalkan(): void
  /** Jalankan sekarang juga bila ada yang tertunda. */
  segera(): void
  /** Batalkan tanpa menjalankan. */
  batal(): void
  /** Ada perubahan yang belum tersimpan. */
  tertunda(): boolean
}

/**
 * Penunda yang MEMBATALKAN pendahulunya.
 *
 * Inilah bedanya dari `setTimeout` telanjang. Tanpa pembatalan, tiap ketukan
 * huruf melahirkan satu permintaan, dan urutan mendaratnya di server tidak
 * dijamin sama dengan urutan berangkatnya.
 */
export function buatPenunda(
  kerjakan: () => void, jeda = JEDA_SIMPAN_MS,
): Penunda {
  let timer: ReturnType<typeof setTimeout> | null = null
  const bersihkan = () => { if (timer !== null) { clearTimeout(timer); timer = null } }
  return {
    jadwalkan() {
      bersihkan()
      timer = setTimeout(() => { timer = null; kerjakan() }, Math.max(0, jeda))
    },
    segera() {
      if (timer === null) return
      bersihkan()
      kerjakan()
    },
    batal: bersihkan,
    tertunda: () => timer !== null,
  }
}

// ── Draf lokal ──────────────────────────────────────────────────────────────

const AWALAN = 'propfs:draf:'

export interface Draf<T> {
  id: string
  isi: T
  at: string
}

/** Kunci penyimpanan sebuah draf. */
export function kunciDraf(id: unknown): string {
  return `${AWALAN}${String(id ?? '').trim()}`
}

type Laci = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Simpan draf ke penyimpanan lokal.
 *
 * Ditulis SETIAP kali isian berubah, tanpa penundaan — berbeda dari
 * penyimpanan ke server. Menundanya berarti menyisakan jendela beberapa ratus
 * milidetik ketika memuat ulang halaman tetap menghapus pekerjaan, dan itu
 * persis jendela yang paling sering terkena: orang menutup halaman tepat
 * setelah mengetik sesuatu.
 *
 * Kegagalannya ditelan dengan sengaja. Penyimpanan bisa penuh atau dilarang
 * (mode penyamaran), dan draf yang gagal disimpan tidak boleh menghentikan
 * pengisian form — ia jaring pengaman, bukan syarat.
 */
export function simpanDraf<T>(id: unknown, isi: T, laci?: Laci, sekarang = new Date()): boolean {
  const l = laci ?? ambilLaci()
  const k = kunciDraf(id)
  if (!l || k === AWALAN) return false
  try {
    l.setItem(k, JSON.stringify({ id: String(id), isi, at: sekarang.toISOString() }))
    return true
  } catch { return false }
}

export function bacaDraf<T>(id: unknown, laci?: Laci): Draf<T> | null {
  const l = laci ?? ambilLaci()
  const k = kunciDraf(id)
  if (!l || k === AWALAN) return null
  try {
    const mentah = l.getItem(k)
    if (!mentah) return null
    const p = JSON.parse(mentah) as Draf<T>
    return p && typeof p === 'object' && 'isi' in p ? p : null
  } catch { return null }
}

export function hapusDraf(id: unknown, laci?: Laci): void {
  const l = laci ?? ambilLaci()
  const k = kunciDraf(id)
  if (!l || k === AWALAN) return
  try { l.removeItem(k) } catch { /* tidak apa-apa */ }
}

function ambilLaci(): Laci | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch { return null }
}

/**
 * Apakah draf lokal lebih baru daripada salinan server.
 *
 * Dipakai memutuskan mana yang dipakai saat halaman dibuka. Draf hanya menang
 * bila ia BENAR-BENAR lebih baru: draf basi yang tertinggal dari sesi
 * kemarin tidak boleh menimpa pekerjaan yang sudah dilakukan di perangkat
 * lain.
 */
export function drafLebihBaru(
  draf: { at?: string } | null | undefined,
  serverAt: unknown,
): boolean {
  const d = Date.parse(String(draf?.at ?? ''))
  if (!Number.isFinite(d)) return false
  const s = Date.parse(String(serverAt ?? ''))
  // Tanpa waktu server sama sekali, draf yang ada dipakai: kehilangan yang
  // pasti lebih buruk daripada memakai salinan yang mungkin sedikit lama.
  if (!Number.isFinite(s)) return true
  return d > s
}

export type StatusSimpan = 'diam' | 'menyimpan' | 'tersimpan' | 'gagal'

/**
 * Kalimat penanda di layar.
 *
 * "Gagal" HARUS terlihat. Selama ini kegagalan menyimpan tidak meninggalkan
 * jejak apa pun, dan yang mengisi form baru mengetahuinya setelah memuat
 * ulang halaman dan menemukan isiannya kosong.
 */
export function labelSimpan(s: StatusSimpan, adaDraf = false): string {
  if (s === 'menyimpan') return 'Menyimpan…'
  if (s === 'tersimpan') return 'Tersimpan'
  if (s === 'gagal') {
    return adaDraf
      ? 'Belum tersimpan ke server — isian aman di perangkat ini.'
      : 'Belum tersimpan ke server.'
  }
  return ''
}
