// ============================================================
// PropFS — Menyegarkan sesi saat token sudah kedaluwarsa
//
// Modul-modul REST di aplikasi ini sengaja memanggil PostgREST langsung dengan
// token dari localStorage, bukan lewat supabase-js, karena supabase-js bisa
// MENGGANTUNG ketika auto-refresh saling kunci antar-tab. Harganya: token yang
// dibaca bisa saja sudah kedaluwarsa, dan Supabase menolaknya sebagai HTTP 401.
//
// Itulah sebabnya halaman sering gagal di PEMBUKAAN PERTAMA lalu sembuh setelah
// dimuat ulang — supabase-js sempat menyegarkan tokennya di latar belakang
// beberapa saat kemudian. Yang terlihat pemakainya: "harus reload dulu".
//
// Di sini token disegarkan HANYA ketika sudah terlanjur ditolak, bukan di
// setiap panggilan. Dengan begitu jalur normal tetap secepat sebelumnya dan
// tidak ikut terkena risiko menggantung.
//
// supabase-js diimpor SECARA DINAMIS, di dalam fungsi. Itu disengaja: berkas
// ini diimpor oleh modul yang harus tetap bisa diuji di Node, dan impor statis
// akan menyeret seluruh pustaka browser ke dalamnya.
// ============================================================

/** Jangan menyegarkan berkali-kali untuk satu kedaluwarsa yang sama. */
let sedangSegar: Promise<string | null> | null = null

/**
 * Minta access token yang masih berlaku.
 *
 * `getSession()` pada supabase-js akan otomatis menukar refresh token bila
 * yang tersimpan sudah lewat masa. Nilai balik null berarti sesinya memang
 * sudah habis — pemakainya harus masuk lagi, dan itu bukan sesuatu yang bisa
 * diperbaiki dengan mengulang permintaan.
 */
export async function segarkanToken(): Promise<string | null> {
  if (sedangSegar) return sedangSegar
  sedangSegar = (async () => {
    try {
      const { supabase } = await import('./supabase')
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    } finally {
      // Dilepas pada putaran berikutnya supaya panggilan yang menyusul dalam
      // rentang waktu yang sama tetap berbagi satu penyegaran.
      setTimeout(() => { sedangSegar = null }, 0)
    }
  })()
  return sedangSegar
}

/**
 * true bila permintaan layak diulang dengan token baru.
 *
 * Hanya 401 (token ditolak) yang diulang. 403 berarti tokennya sah tetapi
 * haknya kurang — mengulang tidak akan mengubah apa pun, dan justru
 * menyembunyikan masalah RLS yang sebenarnya perlu diperbaiki.
 */
export function perluSegarkan(status: number, adaToken: boolean): boolean {
  return status === 401 && adaToken
}
