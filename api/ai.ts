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
 * Batas waktu fungsi, dinyatakan terang-terangan.
 *
 * Membaca foto nota bisa memakan puluhan detik — apalagi karena permintaannya
 * kini melewati dua perjalanan. Batas bawaan yang pendek akan memutusnya di
 * tengah jalan dan mengembalikan 504 tanpa keterangan apa pun, yang di layar
 * tampak seperti "tidak selesai-selesai". Disebutkan di sini supaya tidak
 * bergantung pada nilai bawaan yang bisa berubah.
 */
export const config = { maxDuration: 60 }

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

/**
 * Nama model yang belum ada di daftar tetap, tetapi jelas milik keluarga yang
 * sama dan bukan model mahal.
 *
 * Daftar tetap di atas tidak bisa mengikuti Google: nama baru muncul kapan saja,
 * dan menunggu deploy untuk tiap rilis berarti fiturnya tertinggal berminggu-
 * minggu. Tetapi membuka pintu sepenuhnya mengubah perantara ini menjadi akses
 * ke seluruh katalog atas tanggungan kami — termasuk model termahal.
 *
 * Jalan tengahnya: terima nama Gemini apa pun KECUALI yang menghasilkan gambar
 * atau suara, sebab di situlah tarifnya melonjak. Model gambar tetap harus
 * disebut satu per satu di daftar tetap.
 */
const POLA_AMAN = /^gemini-[0-9][0-9.]*-(flash|pro)(-[a-z0-9-]+)?$/i
const POLA_MAHAL = /-(image|tts|audio|live|native-audio)|image-generation/i

const bolehDipakai = (m: string): boolean =>
  MODEL_BOLEH.has(m) || (POLA_AMAN.test(m) && !POLA_MAHAL.test(m))

/**
 * Model yang boleh dipakai TAMU — vendor yang membuka tautan invoice tanpa
 * akun.
 *
 * Jauh lebih sempit daripada daftar untuk pengguna yang sudah masuk. Tamu
 * dikenali hanya dari sepotong token di dalam tautan WhatsApp, dan tautan
 * WhatsApp diteruskan orang. Yang dibutuhkannya cuma satu: membaca selembar
 * invoice. Jalur Pro tidak dibuka — tarif tokennya beberapa kali lipat, dan
 * yang menanggungnya bukan yang memakainya.
 */
const bolehUntukTamu = (m: string): boolean =>
  bolehDipakai(m) && /-flash(-|$)/i.test(m) && !POLA_MAHAL.test(m)

/** Batas ukuran badan permintaan tamu. Satu foto nota yang sudah dikecilkan
 *  jauh di bawah ini; yang jauh di atasnya bukan invoice. */
const BATAS_BADAN_TAMU = 4_000_000

/** Berapa kali satu tautan invoice boleh memakai AI. */
const JATAH_AI_TAMU = 12

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
/**
 * Ingatan singkat hasil pemeriksaan token.
 *
 * Tanpa ini, SETIAP panggilan AI menambah satu perjalanan bolak-balik ke
 * Supabase sebelum permintaannya bahkan mulai berjalan — biaya tetap yang
 * ditanggung di depan, pada tiap pesan. Umurnya sengaja pendek: sesi yang
 * dicabut masih bisa dipakai paling lama satu menit, dan itu batas yang wajar
 * untuk menghapus satu perjalanan dari setiap permintaan.
 *
 * Hidup di lingkup modul, jadi hanya bertahan selama instans fungsinya hangat.
 * Itu memadai: yang ingin dihilangkan adalah pengulangan dalam satu sesi
 * mengetik, bukan menyimpan keadaan jangka panjang.
 */
const ingatanToken = new Map<string, number>()
const UMUR_INGATAN = 60_000

async function penggunaSah(token: string): Promise<boolean> {
  // URL & anon key Supabase memang publik — keduanya dipagari RLS dan sudah
  // ada di bundel dengan sengaja. Jadi jalan mundur ke nama VITE_ di sini
  // tidak membocorkan apa pun, tidak seperti kunci Gemini/Midtrans/Resend.
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !token) return false

  const sampai = ingatanToken.get(token)
  if (sampai && sampai > Date.now()) return true

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    })
    if (!res.ok) return false

    // Jangan biarkan ingatannya tumbuh tanpa batas pada instans yang berumur
    // panjang; token yang sudah lewat waktunya dibuang saat ada yang baru masuk.
    if (ingatanToken.size > 500) {
      const kini = Date.now()
      for (const [k, v] of ingatanToken) if (v <= kini) ingatanToken.delete(k)
    }
    ingatanToken.set(token, Date.now() + UMUR_INGATAN)
    return true
  } catch {
    return false
  }
}

/**
 * Apakah pemanggilnya vendor yang memegang tautan invoice yang masih hidup.
 *
 * Vendor tidak punya akun dan tidak akan pernah punya — memaksanya mendaftar
 * hanya untuk mengirim satu tagihan berarti ia akan mengirim fotonya lewat
 * WhatsApp seperti dulu, dan seluruh fiturnya tidak terpakai.
 *
 * Karena itu izinnya dipersempit dari beberapa arah sekaligus, bukan satu:
 * hanya model Flash, hanya sekian kali per tautan, hanya badan sekian megabita,
 * dan tautannya mati begitu tagihannya terkirim. RPC di bawah MENAIKKAN
 * penghitungnya di dalam satu pernyataan yang sama dengan pemeriksaannya —
 * kalau dipisah, dua permintaan yang datang bersamaan sama-sama membaca angka
 * lama dan batasnya terlewati.
 */
async function tamuSah(token: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !token || token.length < 8 || token.length > 64) return false
  try {
    const r = await fetch(`${url}/rest/v1/rpc/invoice_ai_boleh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
      body: JSON.stringify({ p_token: token, p_batas: JATAH_AI_TAMU }),
    })
    if (!r.ok) return false
    return (await r.json()) === true
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
  const undangan = String(req.headers['x-propfs-undangan'] ?? '').trim()

  // Pengguna yang sudah masuk diperiksa lebih dulu: jalur itu yang dipakai
  // hampir setiap permintaan, dan memeriksa tautan tamu untuknya berarti satu
  // perjalanan ke basis data yang selalu sia-sia.
  let tamu = false
  if (!(await penggunaSah(token))) {
    tamu = undangan ? await tamuSah(undangan) : false
    if (!tamu) {
      return res.status(401).json({
        error: { code: 401, status: 'UNAUTHENTICATED', message: 'Silakan masuk dulu untuk memakai fitur AI.' },
      })
    }
  }

  const { aksi, model, ...isi } = (req.body ?? {}) as {
    aksi?: string
    model?: string
    [k: string]: unknown
  }

  if (tamu) {
    // Katalog model bukan urusan tamu; ia hanya perlu membaca selembar invoice.
    if (aksi) {
      return res.status(403).json({
        error: { code: 403, status: 'TAMU_TERBATAS', message: 'Aksi ini tidak tersedia lewat tautan undangan.' },
      })
    }
    if (!bolehUntukTamu(String(model ?? ''))) {
      return res.status(400).json({
        error: { code: 400, status: 'MODEL_NOT_ALLOWED', message: 'Model itu tidak tersedia lewat tautan undangan.' },
      })
    }
    // Diukur SETELAH lolos pemeriksaan lain supaya tidak ada yang bisa membuat
    // kami menyusun ulang muatan raksasa hanya untuk mengukurnya.
    if (JSON.stringify(isi).length > BATAS_BADAN_TAMU) {
      return res.status(413).json({
        error: { code: 413, status: 'TERLALU_BESAR', message: 'Berkasnya terlalu besar. Kirim foto satu halaman saja.' },
      })
    }
  }

  // Daftar model: dipakai halaman Tes Koneksi untuk menjawab "model apa yang
  // boleh dipakai kunci ini" tanpa pernah menyentuh kuncinya.
  if (aksi === 'daftarModel') {
    const r = await fetch(`${GOOGLE}/models?key=${kunci}&pageSize=200`)
    // Bentuk kunci dilaporkan juga saat BERHASIL. Kunci yang bentuknya keliru
    // bisa lolos beberapa saat lalu ditolak sendiri; kalau bentuknya hanya
    // dilaporkan pada kegagalan, satu-satunya cara mengetahuinya adalah
    // menunggu sampai ia gagal — persis yang sudah terjadi.
    res.setHeader('X-PropFS-Bentuk-Kunci', bentukKunci(kunci))
    return res.status(r.status).send(await r.text())
  }

  const m = String(model ?? '')
  if (!bolehDipakai(m)) {
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
