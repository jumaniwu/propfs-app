// ============================================================
// PropFS — Satu-satunya pintu ke Gemini dari sisi browser
//
// Dulu ada enam tempat yang menyusun sendiri URL Google lengkap dengan
// `?key=${import.meta.env.VITE_GEMINI_API_KEY}`. Karena Vite MENYISIPKAN semua
// variabel berawalan VITE_ ke dalam bundel, kuncinya ikut tercetak apa adanya
// di berkas JavaScript yang diunduh setiap pengunjung propfs.id. Ia tidak
// pernah rahasia sedetik pun — dan akhirnya dipanen orang, dipakai atas
// tanggungan kami, dan membuat project-nya disuspend Google.
//
// Kuncinya kini hanya hidup di server (`GEMINI_API_KEY`, tanpa awalan VITE_).
// Browser memanggil /api/ai, dan berkas ini satu-satunya yang tahu caranya.
// Enam tempat tadi memanggil `panggilGemini()`; tak satu pun lagi menyentuh
// kunci, karena tidak ada kunci untuk disentuh.
//
// Status dan badan respons diteruskan apa adanya dari Google, supaya
// diagnosaAi.ts tetap bisa membaca kalimat aslinya — kalimat itulah yang
// menyebut sebab dan perbaikannya.
// ============================================================

/** Alamat perantara. Bukan alamat Google — itulah inti perubahannya. */
export const JALUR_AI = '/api/ai'

export interface BadanGemini {
  contents: unknown
  systemInstruction?: unknown
  generationConfig?: unknown
  [k: string]: unknown
}

/**
 * Token pengguna yang sedang masuk.
 *
 * Perantara menolak permintaan tanpa token: perantara terbuka sama saja dengan
 * kunci terbuka, sebab siapa pun cukup memanggilnya dan tagihannya tetap jatuh
 * ke pemilik project.
 */
async function token(): Promise<string> {
  try {
    // Diimpor saat dipakai, bukan saat modul dimuat. Modul supabase menyentuh
    // `import.meta.env` dan jaringan; mengimpornya di puncak berkas akan
    // membuat setiap modul AI ikut menariknya — termasuk saat diuji di Node,
    // yang tidak punya keduanya.
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ''
  } catch {
    return ''
  }
}

/**
 * Panggil satu model Gemini lewat perantara.
 *
 * Mengembalikan `Response` apa adanya — bukan JSON yang sudah diolah — supaya
 * pemanggilnya tetap bisa membedakan 403, 429, dan 503 seperti sebelumnya,
 * dan supaya badan galat Google sampai utuh ke pengklasifikasi galat.
 */
export async function panggilGemini(model: string, badan: BadanGemini): Promise<Response> {
  return fetch(JALUR_AI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify({ model, ...badan }),
  })
}

/** Katalog model yang boleh dipakai kunci di server. */
export async function daftarModelGemini(): Promise<Response> {
  return fetch(JALUR_AI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify({ aksi: 'daftarModel' }),
  })
}
