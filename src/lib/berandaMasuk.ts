// ============================================================
// PropFS — Ke mana pemakai mendarat setiap kali masuk (logika murni)
//
// Sampai sekarang setiap pintu masuk bermuara ke `/home`: tombol "Buka Portal"
// di landing page, pengalihan setelah login, tombol Portal di header, dan
// fallback rute tak dikenal. `/home` adalah dashboard akun lama — sapaan,
// jumlah proyek, kartu modul — yang harus diklik sekali lagi sebelum sampai ke
// pekerjaan yang sebenarnya. Untuk pemakai yang membeli Kontraktor AI, halaman
// itu murni satu ketukan tambahan.
//
// Modul ini menjawab satu pertanyaan: rute mana yang menjadi beranda seseorang,
// berdasarkan apa yang boleh ia buka. Dipisah dari komponen supaya jawabannya
// SAMA di semua pintu masuk — dulu tiap tempat menuliskan '/home' sendiri-
// sendiri, dan itulah sebabnya mengubahnya harus menyentuh tujuh berkas.
//
// Satu jebakan yang sengaja dihindari di sini: penjaga rute yang menolak fitur
// terkunci TIDAK boleh membuang pemakai ke beranda yang ia sendiri tidak
// berhak buka. Kalau `/kontraktor` menolak lalu melempar ke beranda, dan
// beranda menghitung `/kontraktor` lagi, pemakainya terjebak dalam lingkaran
// pengalihan tanpa akhir. Karena itu `rutaMasuk` hanya pernah mengembalikan
// rute yang aksesnya SUDAH dipastikan, dan penolakan fitur punya tujuannya
// sendiri (`RUTA_LANGGANAN`) yang selalu boleh dibuka siapa pun yang login.
//
// Tanpa DOM & tanpa React supaya bisa diuji di Node.
// ============================================================

export const RUTA_KONTRAKTOR = '/kontraktor'
export const RUTA_FS = '/dashboard'
/** Selalu boleh dibuka pemakai yang sudah login — dasar lingkaran pengalihan. */
export const RUTA_LANGGANAN = '/pricing'

export interface AksesMasuk {
  /** Sesi karyawan: aksesnya menumpang langganan perusahaan. */
  sesiTim?: boolean
  /** Kontraktor AI terbuka (`cost_control`). */
  kontraktor?: boolean
  /** Feasibility Study terbuka (`fs_module`). */
  fs?: boolean
}

/**
 * Beranda seseorang.
 *
 * Kontraktor AI didahulukan: itulah produk yang dipakai sehari-hari, dan
 * itulah yang diminta menjadi halaman pembuka. Feasibility Study menjadi
 * beranda hanya bagi pelanggan yang memang hanya berlangganan FS.
 */
export function rutaMasuk(akses: AksesMasuk = {}): string {
  // Karyawan tidak punya langganan sendiri; ia selalu mendarat di Kontraktor AI.
  if (akses.sesiTim) return RUTA_KONTRAKTOR
  if (akses.kontraktor) return RUTA_KONTRAKTOR
  if (akses.fs) return RUTA_FS
  // Belum berlangganan apa pun: yang berguna baginya adalah halaman paket,
  // bukan beranda kosong yang setiap ikonnya terkunci.
  return RUTA_LANGGANAN
}

export interface RencanaTertunda {
  plan: string
  bulan: number
}

/**
 * Paket yang sudah dipilih tetapi invoice-nya belum diterbitkan.
 *
 * Dua sumber, karena ada dua jalan masuk:
 *  - `?create_invoice=pro&months=3` — dari tombol paket saat sudah login.
 *  - `propfs_pending_plan` di localStorage — dipilih saat mendaftar, lalu
 *    pemakainya keluar dari aplikasi untuk mengonfirmasi email. Kembali ke
 *    aplikasi lewat tautan email, seluruh parameter URL-nya sudah hilang;
 *    tanpa simpanan ini pilihan paketnya lenyap begitu saja.
 *
 * `free` bukan rencana: tidak ada yang perlu ditagihkan.
 */
export function bacaRencanaTertunda(
  cari: string | null | undefined,
  simpanan: string | null | undefined,
): RencanaTertunda | null {
  const q = new URLSearchParams(String(cari ?? ''))
  const dariUrl = (q.get('create_invoice') ?? '').trim()
  if (dariUrl && dariUrl !== 'free') {
    return { plan: dariUrl, bulan: bulanSah(q.get('months')) }
  }

  if (!simpanan) return null
  try {
    const p = JSON.parse(simpanan) as { plan?: unknown; months?: unknown }
    const plan = String(p?.plan ?? '').trim()
    if (!plan || plan === 'free') return null
    return { plan, bulan: bulanSah(p?.months) }
  } catch {
    // Simpanan rusak bukan alasan untuk gagal masuk.
    return null
  }
}

/** Bulan langganan yang masuk akal; apa pun yang aneh dianggap 1 bulan. */
function bulanSah(v: unknown): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/**
 * Jalur yang menerbitkan invoice untuk sebuah paket.
 *
 * `/home` tidak lagi menampilkan dashboard apa pun — ia kini hanya pintu yang
 * menerbitkan tagihan lalu meneruskan pemakainya ke berandanya. Alamatnya
 * dipertahankan karena sudah tersebar di tautan lama dan di email pendaftaran.
 */
export function rutaTagihan(plan: string, bulan = 1): string {
  const b = bulanSah(bulan)
  const dasar = `/home?create_invoice=${encodeURIComponent(plan)}`
  return b > 1 ? `${dasar}&months=${b}` : dasar
}

/**
 * Ke mana pemakai diarahkan setelah menekan tombol paket.
 *
 * Paket gratis tidak menerbitkan invoice, jadi ia langsung mendarat di
 * berandanya.
 */
export function rutaSetelahMasuk(akses: AksesMasuk, plan?: string | null, bulan = 1): string {
  const p = String(plan ?? '').trim()
  if (p && p !== 'free') return rutaTagihan(p, bulan)
  return rutaMasuk(akses)
}
