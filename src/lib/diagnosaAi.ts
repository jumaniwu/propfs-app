// ============================================================
// PropFS — Menerjemahkan penolakan Gemini menjadi langkah perbaikan
//
// `galatAi.ts` menjawab "jenis kegagalannya apa" supaya aplikasi tahu apakah
// upayanya layak diulang. Modul ini menjawab pertanyaan berikutnya, yang jauh
// lebih mahal bila tidak terjawab: "lalu apa yang harus saya perbaiki".
//
// Sebabnya nyata. Ketika kunci Gemini ditolak, yang sampai ke layar hanyalah
// "403 PERMISSION_DENIED" — padahal empat keadaan yang sama sekali berbeda
// semuanya berbunyi 403:
//
//   • kunci dibatasi ke domain tertentu dan propfs.id belum termasuk
//   • API "Generative Language" belum diaktifkan di project kuncinya
//   • project-nya disuspend Google
//   • kunci berasal dari project yang BUKAN project yang dibayar
//
// Keempatnya butuh perbaikan yang berlainan, di halaman yang berlainan. Tanpa
// membedakannya, satu-satunya cara maju adalah menebak — dan menebak inilah
// yang membuat satu masalah berputar berhari-hari. Yang membuatnya menyakitkan:
// Google SUDAH menuliskan sebab yang tepat di badan responsnya. Aplikasilah
// yang membuangnya sebelum sempat terbaca.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export type SebabAi =
  | 'kunci_dibatasi'    // kunci dikunci ke domain/IP yang tidak memuat propfs.id
  | 'api_mati'          // Generative Language API belum diaktifkan di project
  | 'project_suspend'   // project/consumer disuspend Google
  | 'billing'           // project kunci tidak terhubung ke akun penagihan
  | 'kunci_salah'       // kunci keliru, kedaluwarsa, atau tidak terkirim
  | 'kuota'             // kuota / rate limit
  | 'model_tak_ada'     // nama model tidak dikenal
  | 'padat'             // sisi Google sedang penuh
  | 'jaringan'
  | 'tidak_dikenali'

export interface Diagnosa {
  sebab: SebabAi
  /** Apa yang sebenarnya terjadi — satu kalimat, tanpa kode. */
  apa: string
  /** Yang harus dikerjakan. Kalimat perintah, bukan daftar kemungkinan. */
  perbaikan: string
  /** Halaman tempat mengerjakannya. */
  tautan?: string
  /** Kalimat asli dari penyedia. Inilah yang selama ini dibuang. */
  asli: string
  /**
   * Siapa yang mengucapkan `asli`.
   *
   * Perantara /api/ai memakai bentuk galat yang sama dengan Google, dan
   * kalimatnya sempat ditampilkan sebagai "Kata Google" — padahal Google tidak
   * pernah mengatakannya. Menisbahkan kalimat kepada pihak yang tidak
   * mengucapkannya membuat orang mencari perbaikannya di tempat yang salah.
   */
  sumber: 'google' | 'kami'
  /** Perbaikannya ada di setelan kami, bukan pada pemakai. */
  sisiKami: boolean
}

export const TAUTAN = {
  kunci: 'https://console.cloud.google.com/apis/credentials',
  aktifkanApi: 'https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com',
  billing: 'https://console.cloud.google.com/billing',
  studio: 'https://aistudio.google.com/apikey',
} as const

/**
 * Ambil kalimat penjelas dari badan respons Google.
 *
 * JSON.parse dicoba lebih dulu; regex hanya jaring pengaman untuk badan yang
 * terpotong — dan badan memang sering terpotong, karena pemanggilnya memangkas
 * teks galat sebelum meneruskannya.
 */
export function pesanPenyedia(badan: unknown): string {
  const t = String(badan ?? '').trim()
  if (!t) return ''

  try {
    const j = JSON.parse(t) as { error?: { message?: unknown }; message?: unknown }
    const m = j?.error?.message ?? j?.message
    if (typeof m === 'string' && m.trim()) return m.trim()
  } catch { /* badan terpotong atau bukan JSON — lanjut ke regex */ }

  // Badan yang terpotong di tengah masih menyimpan awal pesannya.
  const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(t)?.[1]
  if (m) {
    try { return JSON.parse(`"${m}"`) as string } catch { return m }
  }
  return t
}

/** Kode status HTTP yang tersembunyi di dalam teks, bila ada. */
function kodeDalam(teks: string): number {
  return Number(/\b(400|401|402|403|404|429|500|502|503|504)\b/.exec(teks)?.[1] ?? 0)
}

interface Aturan {
  cocok: (t: string, kode: number) => boolean
  jadi: Omit<Diagnosa, 'asli'>
}

const d = (
  sebab: SebabAi, apa: string, perbaikan: string, tautan?: string, sisiKami = true,
  sumber: 'google' | 'kami' = 'google',
): Omit<Diagnosa, 'asli'> => ({ sebab, apa, perbaikan, tautan, sisiKami, sumber })

/**
 * Aturan diperiksa berurutan; yang paling khas didahulukan.
 *
 * Urutannya menentukan. Kata "billing" ikut muncul di dalam pesan
 * SERVICE_DISABLED, jadi mencocokkan "billing" lebih dulu akan mengirim orang
 * ke halaman penagihan padahal yang mati adalah API-nya — persis jenis
 * kesalahan arah yang modul ini dibuat untuk menghentikannya.
 */
const ATURAN: Aturan[] = [
  // Galat perantara kami sendiri didahulukan: statusnya (500/401) kebetulan
  // sama dengan status Google untuk hal yang sama sekali berbeda, jadi
  // mencocokkan kode lebih dulu akan menyesatkan.
  {
    cocok: t => t.includes('no_server_key'),
    jadi: d('kunci_salah',
      'GEMINI_API_KEY belum terbaca di server.',
      'Vercel → Settings → Environment Variables → tambahkan GEMINI_API_KEY (TANPA awalan '
        + 'VITE_, supaya tidak ikut terbundel ke browser), centang Production, lalu REDEPLOY. '
        + 'Menyimpan variabel saja tidak berlaku sampai di-deploy ulang.',
      TAUTAN.studio, true, 'kami'),
  },
  {
    cocok: t => t.includes('unauthenticated') && t.includes('masuk dulu'),
    jadi: d('kunci_salah',
      'Sesi Anda tidak terbaca, jadi permintaan AI ditolak di gerbangnya.',
      'Keluar lalu masuk kembali. Perantara AI sengaja menolak pemanggil tanpa sesi — '
        + 'tanpa pagar itu, siapa pun bisa memakainya atas tanggungan kita.',
      undefined, false, 'kami'),
  },
  {
    cocok: t => t.includes('model_not_allowed'),
    jadi: d('model_tak_ada',
      'Model yang diminta tidak ada di daftar yang diizinkan perantara.',
      'Tambahkan namanya di MODEL_BOLEH pada api/ai.ts — daftar itu sengaja ada supaya '
        + 'perantara tidak berubah menjadi pintu ke seluruh katalog Google atas tanggungan kita.',
      undefined, true, 'kami'),
  },
  {
    cocok: t => t.includes('referer') || t.includes('referrer') || t.includes('http_referrer'),
    jadi: d('kunci_dibatasi',
      'Kunci Gemini dibatasi ke daftar domain tertentu, dan propfs.id belum ada di daftar itu.',
      'Google Cloud Console → Credentials → kunci ini → Website restrictions: tambahkan '
        + 'propfs.id/* dan *.propfs.id/*. Untuk memastikan, boleh dilepas dulu pembatasannya.',
      TAUTAN.kunci),
  },
  {
    cocok: (t, k) => t.includes('ip address') && k === 403,
    jadi: d('kunci_dibatasi',
      'Kunci Gemini dibatasi ke daftar alamat IP, dan pemanggilnya tidak termasuk.',
      'Panggilan ini berasal dari browser pemakai, jadi IP-nya berganti-ganti dan tidak mungkin '
        + 'didaftarkan. Ubah pembatasannya dari IP address menjadi HTTP referrer (domain).',
      TAUTAN.kunci),
  },
  {
    cocok: t => t.includes('has not been used in project') || t.includes('service_disabled')
      || t.includes('is disabled'),
    jadi: d('api_mati',
      'API "Generative Language" belum diaktifkan di project pemilik kunci.',
      'Buka halaman API-nya, tekan ENABLE, lalu tunggu beberapa menit. Pastikan project yang '
        + 'terbuka sama dengan project asal kunci — nomor project-nya disebut di pesan asli di bawah.',
      TAUTAN.aktifkanApi),
  },
  {
    cocok: t => t.includes('suspend'),
    jadi: d('project_suspend',
      'Project pemilik kunci sedang disuspend Google.',
      'Suspend tidak bisa dibuka dari aplikasi dan tidak pulih dengan membayar. Buka Google Cloud '
        + 'Console — biasanya ada pemberitahuan di bagian atas yang menyebut sebabnya (verifikasi '
        + 'identitas, tagihan tertunggak, atau dugaan penyalahgunaan) beserta tombol bandingnya.',
      TAUTAN.billing),
  },
  {
    cocok: t => t.includes('billing'),
    jadi: d('billing',
      'Project pemilik kunci belum terhubung ke akun penagihan yang aktif.',
      'Saldo hanya berlaku untuk project yang tertaut ke akun penagihan itu. Periksa apakah kunci '
        + 'yang dipakai aplikasi memang berasal dari project yang dibayar — kunci lama dari project '
        + 'lain akan tetap ditolak meski saldonya sudah terisi.',
      TAUTAN.billing),
  },
  {
    cocok: t => t.includes('api key not valid') || t.includes('api_key_invalid')
      || t.includes('invalid api key') || t.includes('api key expired'),
    jadi: d('kunci_salah',
      'Kunci Gemini yang terpasang tidak dikenali Google.',
      'Terbitkan kunci baru di Google AI Studio, perbarui GEMINI_API_KEY di Vercel (TANPA '
        + 'awalan VITE_, supaya tidak ikut terbundel ke browser), lalu REDEPLOY — mengubah '
        + 'environment variable saja tidak berlaku sampai di-deploy ulang.',
      TAUTAN.studio),
  },
  {
    cocok: t => t.includes('unregistered callers') || t.includes('unauthenticated')
      || t.includes('no gemini key'),
    jadi: d('kunci_salah',
      'Permintaan sampai ke Google tanpa membawa kunci sama sekali.',
      'GEMINI_API_KEY kosong di server. Periksa isinya di Vercel → Settings → Environment '
        + 'Variables, pastikan tercentang untuk Production, lalu redeploy.',
      TAUTAN.studio),
  },
  {
    cocok: (t, k) => k === 429 || t.includes('quota') || t.includes('resource_exhausted')
      || t.includes('rate limit') || t.includes('rate_limit'),
    jadi: d('kuota',
      'Kuota Gemini untuk saat ini sudah terpakai habis.',
      'Kuota gratis pulih pada pergantian hari waktu Pasifik AS. Untuk menaikkan batasnya, '
        + 'aktifkan penagihan pada project kuncinya.',
      TAUTAN.billing),
  },
  {
    cocok: (t, k) => k === 404 || t.includes('is not found') || t.includes('not supported'),
    jadi: d('model_tak_ada',
      'Nama model yang diminta tidak dikenali Gemini.',
      'Nama model Gemini berganti dari waktu ke waktu. Perbarui daftar model di ai-realisasi.ts.'),
  },
  {
    cocok: (t, k) => [500, 502, 503, 504].includes(k) || t.includes('overload')
      || t.includes('unavailable') || t.includes('internal error') || t.includes('empty response'),
    jadi: d('padat', 'Layanan Gemini sedang penuh.', 'Coba lagi dalam ±1 menit.', undefined, false),
  },
  {
    cocok: t => t.includes('failed to fetch') || t.includes('networkerror')
      || t.includes('load failed') || t.includes('abort') || t.includes('timeout')
      || t.includes('timed out'),
    jadi: d('jaringan', 'Permintaannya tidak sampai ke Google.',
      'Periksa sambungan internet, lalu coba lagi.', undefined, false),
  },
]

/**
 * Terjemahkan satu penolakan menjadi sebab dan langkah perbaikannya.
 *
 * `badan` boleh berupa JSON mentah dari Google, pesan Error, atau teks apa
 * adanya — ketiganya benar-benar beredar di kode pemanggil.
 */
export function diagnosaAi(status: number | undefined, badan: unknown): Diagnosa {
  const asli = pesanPenyedia(badan)
  const teks = `${status ?? ''} ${asli} ${String(badan ?? '')}`.toLowerCase()
  const kode = Number(status) || kodeDalam(teks)

  for (const a of ATURAN) if (a.cocok(teks, kode)) return { ...a.jadi, asli }

  return {
    sebab: 'tidak_dikenali',
    apa: `Gemini menolak permintaan${kode ? ` (${kode})` : ''} tanpa sebab yang dikenali.`,
    perbaikan: asli
      ? 'Kalimat asli dari Google ada di bawah — biasanya ia menyebut sendiri perbaikannya.'
      : 'Google tidak menyertakan penjelasan. Coba lagi; bila berulang, periksa status layanannya.',
    asli,
    sisiKami: false,
    sumber: 'google',
  }
}

/**
 * Satu paragraf siap tempel untuk superadmin.
 *
 * Sengaja memuat kalimat asli Google: dialah keterangan yang paling bisa
 * dipercaya, dan menyembunyikannya persis yang membuat masalah ini berputar
 * berhari-hari.
 */
export function ceritaDiagnosa(dg: Diagnosa): string {
  const baris = [dg.apa, '', `Perbaikan: ${dg.perbaikan}`]
  if (dg.tautan) baris.push(dg.tautan)
  if (dg.asli) {
    // Menyebut "Kata Google" untuk kalimat yang ditulis server kami sendiri
    // mengirim orang mencari perbaikannya di Google Console — tempat yang sama
    // sekali tidak ada hubungannya.
    const siapa = dg.sumber === 'kami' ? 'Kata server kami' : 'Kata Google'
    baris.push('', `${siapa}: "${potong(dg.asli, 240)}"`)
  }
  return baris.join('\n')
}

function potong(t: string, maks: number): string {
  return t.length <= maks ? t : `${t.slice(0, maks - 1)}…`
}
