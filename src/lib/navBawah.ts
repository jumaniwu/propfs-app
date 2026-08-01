// ============================================================
// PropFS — Isi navigasi bawah (logika murni, tanpa DOM)
//
// Dipisah dari komponennya supaya susunan menu dan aturan "item mana yang
// menyala" bisa diuji di Node — komponen .tsx tidak bisa dijalankan Node.
// ============================================================

export interface ItemNav {
  path: string
  label: string
  /** Jalur lain yang juga dianggap milik item ini. */
  match: string[]
}

/**
 * Susunan tetap. Feasibility Study dan AI Architect tidak lagi di sini: keduanya
 * kini satu ikon di dalam grid menu Kontraktor AI. Halamannya tetap hidup, hanya
 * tidak memakan slot navigasi.
 *
 * Beranda sengaja ikut mencocokkan /home, /dashboard, dan /siteplan. Halaman itu
 * masih bisa terbuka — /home bahkan menjadi tujuan pengalihan saat sebuah fitur
 * terkunci — dan navigasi tanpa satu pun tombol menyala membuat pemakainya
 * merasa tersesat.
 */
export const ITEM_NAV: ItemNav[] = [
  {
    path: '/kontraktor', label: 'Beranda',
    match: ['/kontraktor', '/cost-control', '/cost-report', '/home', '/dashboard', '/siteplan', '/input', '/result', '/report'],
  },
  { path: '/kontraktor/chat', label: 'Chat AI', match: ['/kontraktor/chat'] },
  { path: '/kontraktor/tim-chat', label: 'Chat Tim', match: ['/kontraktor/tim-chat'] },
  { path: '/profile', label: 'Profil', match: ['/profile', '/pricing', '/payment'] },
]

/** Halaman yang tidak menampilkan navigasi bawah sama sekali. */
export const TANPA_NAV = ['/auth', '/tim/masuk', '/legal', '/reset-password', '/admin']

/** true bila navigasi bawah pantas tampil di jalur ini. */
export function navTampil(pathname: string, masuk: boolean): boolean {
  if (!masuk) return false
  if (pathname === '/') return false
  return !TANPA_NAV.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Item yang menyala untuk sebuah jalur.
 *
 * Kecocokan TERPANJANG yang menang. Tanpa aturan itu /kontraktor/chat akan
 * menyalakan Beranda (karena mencocokkan '/kontraktor') dan Chat AI sekaligus,
 * dan pemakainya tidak tahu ia sedang berada di mana.
 *
 * Kecocokan juga harus berhenti di batas ruas jalur: '/kontraktor' tidak boleh
 * mengklaim '/kontraktorku'.
 */
export function itemAktif<T extends ItemNav>(items: T[], pathname: string): T | undefined {
  const jalur = String(pathname ?? '')
  let terbaik: T | undefined
  let panjang = -1
  for (const item of items ?? []) {
    for (const m of item?.match ?? []) {
      const cocok = jalur === m || jalur.startsWith(`${m}/`)
      if (cocok && m.length > panjang) {
        terbaik = item
        panjang = m.length
      }
    }
  }
  return terbaik
}
