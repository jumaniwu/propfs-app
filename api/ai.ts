// ============================================================
// PropFS — Vercel Serverless: perantara ke Gemini
// POST /api/ai
//
// Sebabnya sebuah insiden, bukan preferensi.
//
// Kunci Gemini dulu dipasang sebagai VITE_GEMINI_API_KEY. Semua variabel
// berawalan VITE_ DISISIPKAN Vite ke dalam bundel yang diunduh setiap
// pengunjung — jadi kuncinya tercetak apa adanya di tujuh berkas JavaScript di
// propfs.id dan bisa dibaca siapa pun yang membuka DevTools. Ia tidak pernah
// rahasia sedetik pun sejak deploy pertama.
//
// Yang kemudian terjadi persis seperti yang bisa diduga: kuncinya dipanen,
// dipakai orang lain, tagihannya melonjak dalam satu hari, dan Google
// mensuspend project-nya karena "abusive activity consistent with hijacking".
//
// Karena itu kuncinya sekarang hanya hidup di server, sebagai GEMINI_API_KEY
// TANPA awalan VITE_ — supaya tidak mungkin ikut terbawa ke bundel lagi.
// Browser tidak lagi memanggil Google; ia memanggil berkas ini.
//
// Perantara ini WAJIB berpagar. Perantara terbuka sama saja dengan kunci
// terbuka: siapa pun cukup memanggil /api/ai dan tagihannya tetap jatuh ke
// pemilik project. Karena itu:
//   • pemanggilnya harus pengguna yang sudah masuk (token Supabase diperiksa)
//   • hanya model yang memang dipakai aplikasi yang boleh diminta
//   • hanya jalur generateContent & daftar model, bukan seluruh API Google
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Model yang boleh diminta lewat perantara ini.
 *
 * Tanpa daftar ini, perantara berubah menjadi pintu ke seluruh katalog Google
 * atas tanggungan kami — termasuk model termahal yang tidak pernah dipakai
 * aplikasi. Daftarnya sengaja disalin di sini, bukan diimpor dari src/:
 * berkas serverless dibundel terpisah, dan pagar keamanan tidak boleh
 * bergantung pada modul yang bisa berubah karena alasan lain.
 */
const MODEL_BOLEH = new Set([
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
])

const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Bentuk kunci hanya dipakai untuk MENJELASKAN kegagalan, tidak untuk menolak.
 *
 * API key Gemini berbentuk `AIza…` sepanjang 39 karakter. Kredensial Google
 * lain yang mirip sekilas — token sesi `AQ.…`, access token `ya29.…` — ditolak
 * Google dengan 401/403 yang bunyinya sama persis dengan kunci sah yang belum
 * diizinkan, sehingga waktunya habis memperbaiki izin dan penagihan untuk
 * kunci yang memang tidak akan pernah dipakai.
 *
 * Tetapi menolaknya di sini akan lebih buruk: bentuk kunci ditentukan Google
 * dan bisa berubah kapan saja, dan kalau itu terjadi kita akan memblokir kunci
 * yang sebenarnya sah — kegagalan yang jauh lebih sulit ditelusuri daripada
 * yang sedang dicegah. Jadi kuncinya tetap dikirim; bentuknya hanya
 * ditempelkan sebagai keterangan bila Google memang menolaknya.
 */
function bentukKunci(k: string): 'api_key' | 'oauth' | 'tidak_dikenali' {
  if (/^AIza[0-9A-Za-z_-]{35}$/.test(k)) return 'api_key'
  if (/^ya29\./.test(k) || /^AQ\./.test(k) || /^1\/\//.test(k)) return 'oauth'
  return 'tidak_dikenali'
}

/**
 * Apakah pemanggilnya pengguna yang sah.
 *
 * Diperiksa dengan menanyakan token itu ke Supabase, bukan dengan membaca
 * isinya sendiri: membaca isi JWT tanpa memverifikasi tanda tangannya berarti
 * mempercayai apa pun yang dikirim pemanggil.
 */
async function penggunaSah(token: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !token) return false

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    })
    return res.ok
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const kunci = process.env.GEMINI_API_KEY
  if (!kunci) {
    // Sengaja TIDAK jatuh kembali ke VITE_GEMINI_API_KEY. Kunci yang pernah
    // ikut terbundel harus dianggap sudah bocor, dan memakainya lagi berarti
    // mengulang persis kejadian yang membuat project-nya disuspend.
    //
    // NAMA variabel yang mirip ikut dilaporkan — nilainya tidak pernah. Tanpa
    // ini, "belum terbaca" bisa berarti tiga hal yang perbaikannya berbeda:
    // belum ditambahkan sama sekali, salah nama (masih berawalan VITE_, atau
    // ada spasi ikut tersalin), atau tercentang untuk Preview saja sehingga
    // Production tetap kosong. Membedakannya dengan menebak berarti satu
    // siklus deploy untuk setiap tebakan.
    const mirip = Object.keys(process.env)
      // Termasuk yang mengandung API_KEY, supaya salah ketik pada bagian
      // "GEMINI" (mis. GEMNI_API_KEY) tetap terlihat. Nama saja, tak pernah nilai.
      .filter(k => /GEMINI|GOOGLE|GENAI|API_?KEY/i.test(k))
      .sort()
    console.error('[ai] GEMINI_API_KEY belum dipasang. Yang mirip:', mirip)
    return res.status(500).json({
      error: {
        code: 500,
        status: 'NO_SERVER_KEY',
        message: 'GEMINI_API_KEY belum dipasang di server.',
        // Hanya nama, tidak pernah nilai.
        variabelMirip: mirip,
      },
    })
  }

  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!(await penggunaSah(token))) {
    return res.status(401).json({
      error: { code: 401, status: 'UNAUTHENTICATED', message: 'Silakan masuk dulu untuk memakai fitur AI.' },
    })
  }

  const { aksi, model, ...isi } = (req.body ?? {}) as {
    aksi?: string
    model?: string
    [k: string]: unknown
  }

  // Daftar model: dipakai halaman Tes Koneksi untuk menjawab "model apa yang
  // boleh dipakai kunci ini" tanpa pernah menyentuh kuncinya.
  if (aksi === 'daftarModel') {
    const r = await fetch(`${GOOGLE}/models?key=${kunci}&pageSize=200`)
    return res.status(r.status).send(await r.text())
  }

  const m = String(model ?? '')
  if (!MODEL_BOLEH.has(m)) {
    return res.status(400).json({
      error: { code: 400, status: 'MODEL_NOT_ALLOWED', message: `Model "${m}" tidak diizinkan.` },
    })
  }

  try {
    const r = await fetch(`${GOOGLE}/models/${m}:generateContent?key=${kunci}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isi),
    })
    // Status dan badan diteruskan APA ADANYA. Kalimat Google-lah yang menyebut
    // sebab dan perbaikannya, dan pengklasifikasi galat di sisi klien
    // bersandar padanya — membungkusnya ulang akan menghapus satu-satunya
    // keterangan yang berguna.
    res.status(r.status)
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json')
    // Keterangan tambahan lewat header, supaya badan dari Google tetap utuh.
    if (!r.ok) res.setHeader('X-PropFS-Bentuk-Kunci', bentukKunci(kunci))
    return res.send(await r.text())
  } catch (e) {
    console.error('[ai] gagal menghubungi Google:', e)
    return res.status(502).json({
      error: { code: 502, status: 'UPSTREAM_ERROR', message: 'Tidak bisa menghubungi layanan AI.' },
    })
  }
}
