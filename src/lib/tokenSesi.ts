// ============================================================
// PropFS — Mengambil token sesi TANPA pernah menggantung
//
// AKAR MASALAH YANG DIPERBAIKI BERKAS INI.
//
// Sejak kunci Gemini dipindahkan ke server, setiap panggilan AI harus membawa
// token pengguna. Pengambilannya ditulis begini di gemini.ts:
//
//     headers: { Authorization: `Bearer ${await token()}` }
//
// `await` itu berada DI DEPAN fetch, jadi ia berjalan sebelum AbortController
// punya apa pun untuk diputus. Ketika `supabase.auth.getSession()` menemukan
// token yang sudah kedaluwarsa, ia menyegarkannya lewat jaringan — permintaan
// tanpa batas waktu, tanpa sinyal batal. Bila permintaan itu menggantung:
//
//   • jam 45 detik menyala, memanggil abort() ke sambungan yang BELUM ADA;
//   • `clearTimeout` di blok finally tidak pernah tercapai;
//   • janjinya tidak pernah selesai dan tidak pernah gagal.
//
// Yang terlihat di layar persis seperti laporan pemakainya: "AI sedang
// membaca… 114s" padahal tertulis "Berhenti otomatis di 70 detik", tanpa pesan
// galat, selamanya. Anggaran waktu yang dibangun sebelumnya memang benar —
// hanya saja ia tidak pernah menjaga bagian ini.
//
// Ini juga menjawab "dulu gercep". Dulu kuncinya dibaca dari
// `import.meta.env` — sinkron, nol milidetik, tidak ada yang bisa menggantung.
// Perbaikan keamanannya menaruh satu langkah jaringan tak terbatas di depan
// SETIAP panggilan AI. Keamanannya benar; pengawalnya yang belum dipasang.
//
// Tiga lapis, dari yang paling murah:
//   1. Ingatan proses — token yang sama dipakai ulang sampai hampir habis.
//   2. Penyimpanan browser — dibaca SINKRON, tanpa jaringan, tanpa kunci antar-tab.
//   3. Supabase, dengan batas waktu keras dan jatuh ke lapis 2 bila lambat.
//
// Token kedaluwarsa yang terkirim dijawab 401 oleh perantara dalam sedetik,
// dan 401 itu sudah punya diagnosis sendiri: "Keluar lalu masuk kembali."
// Kabar buruk dalam sedetik jauh lebih berguna daripada diam selamanya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/**
 * Batas untuk MENGAMBIL token — bukan batas permintaan AI-nya.
 *
 * Sengaja pendek. Penyegaran token yang sehat selesai jauh di bawah satu detik;
 * yang lewat dari empat detik hampir pasti sedang menggantung, dan menunggunya
 * hanya memakan anggaran yang seharusnya dipakai membaca foto.
 */
export const BATAS_TOKEN_MS = 4_000

/** Token dianggap perlu diganti sebelum benar-benar mati. */
export const JEDA_AMAN_MS = 60_000

export interface Gudang {
  readonly length: number
  key(i: number): string | null
  getItem(k: string): string | null
}

/** Bentuk kunci penyimpanan sesi Supabase: `sb-<ref>-auth-token`. */
const KUNCI_SESI = /^sb-.+-auth-token$/

function uraiNilai(mentah: string): unknown {
  // Versi Supabase yang lebih baru menyimpannya sebagai `base64-<...>`.
  // Keduanya harus terbaca: pemakainya bisa saja belum sempat memuat ulang.
  const isi = mentah.startsWith('base64-')
    ? new TextDecoder().decode(
        Uint8Array.from(atob(mentah.slice(7).replace(/-/g, '+').replace(/_/g, '/')),
          c => c.charCodeAt(0)),
      )
    : mentah
  return JSON.parse(isi)
}

/**
 * Token dari penyimpanan browser — SINKRON, tanpa jaringan.
 *
 * Inilah jaring pengaman ketika Supabase lambat menjawab. Ia dibaca langsung
 * dari tempat Supabase sendiri menyimpannya, jadi isinya token yang sama.
 */
export function bacaTokenSimpanan(g: Gudang | null | undefined): string {
  if (!g) return ''
  try {
    for (let i = 0; i < g.length; i++) {
      const k = g.key(i)
      if (!k || !KUNCI_SESI.test(k)) continue
      const mentah = g.getItem(k)
      if (!mentah) continue
      const sesi = uraiNilai(mentah) as
        | { access_token?: string; currentSession?: { access_token?: string } }
        | null
      const t = sesi?.access_token ?? sesi?.currentSession?.access_token
      if (typeof t === 'string' && t) return t
    }
  } catch { /* isinya rusak atau penyimpanan ditolak — anggap tidak ada */ }
  return ''
}

/**
 * Kapan token ini mati, dalam milidetik epoch. 0 bila tidak terbaca.
 *
 * Dibaca dari klaim `exp` di dalam JWT-nya sendiri, bukan dari jam kedaluwarsa
 * yang kita karang — supaya ingatan di bawah tidak pernah menyimpan token
 * lebih lama daripada masa berlakunya yang sebenarnya.
 */
export function batasToken(jwt: unknown): number {
  const t = String(jwt ?? '')
  const bagian = t.split('.')
  if (bagian.length < 2) return 0
  try {
    const b = bagian[1].replace(/-/g, '+').replace(/_/g, '/')
    const isi = JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4))) as { exp?: number }
    return typeof isi.exp === 'number' ? isi.exp * 1000 : 0
  } catch { return 0 }
}

/** Masih cukup lama untuk dipakai satu panggilan AI. */
export function masihSegar(jwt: unknown, sekarang = Date.now(), jeda = JEDA_AMAN_MS): boolean {
  const batas = batasToken(jwt)
  return batas > 0 && batas - jeda > sekarang
}

/**
 * Jalankan `janji`, tetapi jangan pernah menunggu lebih dari `batasMs`.
 *
 * Selalu SELESAI — tidak pernah melempar dan tidak pernah menggantung. Itulah
 * gunanya: yang memanggilnya berada di depan pekerjaan yang punya anggaran
 * waktu sendiri, dan satu langkah tak terbatas di depan sana meniadakan
 * seluruh anggaran itu.
 */
export function denganBatas<T>(
  janji: Promise<T>, batasMs: number, cadangan: T,
  jadwal: typeof setTimeout = setTimeout,
): Promise<T> {
  return new Promise<T>(selesai => {
    let sudah = false
    const beres = (v: T) => { if (!sudah) { sudah = true; selesai(v) } }
    const jam = jadwal(() => beres(cadangan), Math.max(1, batasMs))
    janji.then(
      v => { clearTimeout(jam as ReturnType<typeof setTimeout>); beres(v) },
      // Kegagalannya tidak dilempar ulang: cadangan lebih berguna daripada
      // galat, dan janji yang ditolak tanpa penangkap memicu peringatan global.
      () => { clearTimeout(jam as ReturnType<typeof setTimeout>); beres(cadangan) },
    )
  })
}

// ── Ingatan satu proses ─────────────────────────────────────────────────────

let ingatan = ''

/**
 * Token yang bisa dipakai sekarang juga tanpa menyentuh apa pun, bila ada.
 *
 * Bukan sekadar penghematan: inilah yang membuat pesan kedua dan seterusnya
 * tidak pernah lagi mampir ke jalur yang bisa menggantung.
 */
export function tokenIngatan(sekarang = Date.now()): string {
  return masihSegar(ingatan, sekarang) ? ingatan : ''
}

export function ingatToken(jwt: unknown, sekarang = Date.now()): void {
  const t = String(jwt ?? '')
  ingatan = masihSegar(t, sekarang) ? t : ''
}

/** Untuk pengujian dan untuk saat pengguna keluar. */
export function lupakanToken(): void { ingatan = '' }
