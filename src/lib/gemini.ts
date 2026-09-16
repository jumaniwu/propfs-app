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

import { buatAnggaran, pantasDicobaLagi, galatWaktuHabis } from './anggaranWaktu.ts'
import {
  BATAS_TOKEN_MS, bacaTokenSimpanan, denganBatas, ingatToken, tokenIngatan,
  lupakanToken, masihSegar,
} from './tokenSesi.ts'

/** Alamat perantara. Bukan alamat Google — itulah inti perubahannya. */
export const JALUR_AI = '/api/ai'

/**
 * Batas waktu satu panggilan.
 *
 * Tanpa ini, permintaan yang menggantung tidak pernah selesai DAN tidak pernah
 * gagal: gelembung "AI sedang membaca…" berputar tanpa akhir, dan pemakainya
 * tidak diberi apa pun untuk ditindak — tidak pesan galat, tidak saran, tidak
 * kesempatan mencoba ulang. Diam selamanya lebih buruk daripada kabar buruk.
 *
 * Lebih panjang daripada batas fungsi serverless (60 detik) supaya galat dari
 * server sempat sampai lebih dulu; angka ini hanya jaring pengaman untuk
 * jaringan yang menggantung di tengah jalan, bukan untuk permintaan yang lambat.
 */
export const BATAS_MS = 75_000

/**
 * Jalankan permintaan dengan batas waktu.
 *
 * Memakai AbortController supaya sambungannya benar-benar diputus — janji yang
 * ditinggalkan tanpa memutus sambungan tetap menahan unggahan foto berjalan di
 * latar, dan pada sinyal lemah itu memperlambat percobaan berikutnya.
 */
/**
 * Token undangan yang sedang berlaku, bila halaman ini dibuka tamu.
 *
 * Vendor tidak punya sesi Supabase — ia hanya memegang sepotong token di dalam
 * tautan WhatsApp. Perantara menerimanya sebagai izin yang JAUH lebih sempit:
 * hanya model Flash, berjatah, dan mati begitu tagihannya terkirim.
 */
let undangan = ''
export function pakaiUndangan(token: string): void { undangan = String(token ?? '').trim() }
export function lupakanUndangan(): void { undangan = '' }

/**
 * Token yang BENAR-BENAR baru, dipakai setelah perantara menolak dengan 401.
 *
 * Token Supabase berumur satu jam. Aplikasi ini dibuka berjam-jam di lapangan,
 * jadi kedaluwarsa di tengah pemakaian bukan kasus tepi — itu kejadian
 * harian. Yang terbaca pemakainya: "Sesi Anda tidak terbaca, jadi permintaan
 * AI ditolak di gerbangnya", beserta saran keluar lalu masuk kembali — untuk
 * sesi yang sebenarnya masih sah dan hanya perlu disegarkan.
 *
 * Penyegaran itu ada dan otomatis; yang tidak ada adalah yang MEMICUNYA saat
 * 401 datang. Di sinilah.
 */
async function tokenSegar(): Promise<string> {
  lupakanToken()
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    let t = data.session?.access_token ?? ''
    // getSession() menyegarkan yang sudah lewat waktunya, tetapi tidak selalu
    // yang HAMPIR lewat — dan token yang tinggal beberapa detik akan ditolak
    // lagi pada percobaan kedua.
    if (!masihSegar(t)) {
      const { data: baru } = await supabase.auth.refreshSession()
      t = baru.session?.access_token ?? t
    }
    ingatToken(t)
    return t
  } catch {
    // Gagal menyegarkan bukan alasan melempar: pemanggilnya sudah memegang
    // jawaban 401 yang asli, dan itu yang harus sampai ke pemakainya.
    return ''
  }
}

async function kirim(badan: unknown, batasMs = BATAS_MS): Promise<Response> {
  const mulaiSemua = Date.now()
  const res = await kirimSekali(badan, batasMs)

  // 401 hanya berarti "tokennya tidak berlaku", dan itu paling sering berarti
  // "sudah kedaluwarsa" — bukan "Anda belum masuk". Disegarkan sekali lalu
  // diulang; kalau masih ditolak juga, jawaban aslinya yang diteruskan.
  //
  // Tamu tidak ikut: ia memang tidak punya sesi untuk disegarkan.
  if (res.status !== 401 || undangan) return res

  const segar = await tokenSegar()
  if (!segar) return res

  const sisa = batasMs - (Date.now() - mulaiSemua)
  return await kirimSekali(badan, Math.max(8_000, sisa))
}

async function kirimSekali(badan: unknown, batasMs = BATAS_MS): Promise<Response> {
  // Token diambil DI LUAR blok berikut, dan ia punya batas waktunya sendiri.
  //
  // Menaruh `await token()` di dalam susunan header terlihat rapi, tetapi
  // menempatkan satu langkah jaringan tak terbatas di depan pengaman yang
  // belum menjaga apa pun: jam di bawah memutus `signal`, dan pada detik itu
  // `fetch` bahkan belum dipanggil. Itulah sebab "AI sedang membaca… 114s"
  // pada layar yang menjanjikan berhenti di 70 detik. Lihat tokenSesi.ts.
  const mulai = Date.now()
  // Tamu tidak punya sesi, dan mencarinya tetap akan memakan waktu tunggu
  // untuk sesuatu yang sudah pasti tidak ada.
  const auth = undangan ? '' : await token()
  const sisa = Math.max(5_000, batasMs - (Date.now() - mulai))

  const pemutus = new AbortController()
  let diputusKami = false
  const jam = setTimeout(() => { diputusKami = true; pemutus.abort() }, Math.max(1000, sisa))
  try {
    return await fetch(JALUR_AI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(undangan ? { 'X-PropFS-Undangan': undangan } : {}),
      },
      body: JSON.stringify(badan),
      signal: pemutus.signal,
    })
  } catch (e) {
    // Pemutusan OLEH KITA harus bisa dibedakan dari jaringan yang putus
    // sendiri. Keduanya melempar AbortError yang sama persis, dan menyamakannya
    // membuat tenggat yang terlampaui dibaca sebagai gangguan sementara —
    // lalu diulang, tepat pada keadaan yang sudah pasti terlalu lambat.
    if (diputusKami) throw galatWaktuHabis(Math.round(batasMs / 1000))
    throw e
  } finally {
    clearTimeout(jam)
  }
}

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
  // 1. Ingatan proses. Pesan kedua dan seterusnya tidak menyentuh apa pun.
  const diingat = tokenIngatan()
  if (diingat) return diingat

  // 2. Penyimpanan browser — sinkron, tanpa jaringan. Ini cadangannya bila
  //    Supabase lambat, dan ia berisi token yang sama persis.
  const cadangan = bacaTokenSimpanan(
    (globalThis as { localStorage?: Parameters<typeof bacaTokenSimpanan>[0] }).localStorage,
  )

  // 3. Supabase, DENGAN BATAS WAKTU. `getSession()` menyegarkan token yang
  //    kedaluwarsa lewat jaringan, tanpa batas dan tanpa sinyal batal; di
  //    sinyal lemah ia bisa menggantung berjam-jam. Sebelumnya penungguan itu
  //    tidak dibatasi siapa pun.
  const dariSupabase = (async () => {
    // Diimpor saat dipakai, bukan saat modul dimuat. Modul supabase menyentuh
    // `import.meta.env` dan jaringan; mengimpornya di puncak berkas akan
    // membuat setiap modul AI ikut menariknya — termasuk saat diuji di Node,
    // yang tidak punya keduanya.
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ''
  })()

  const hasil = (await denganBatas(dariSupabase, BATAS_TOKEN_MS, cadangan)) || cadangan
  ingatToken(hasil)
  return hasil
}

/**
 * Panggil satu model Gemini lewat perantara.
 *
 * Mengembalikan `Response` apa adanya — bukan JSON yang sudah diolah — supaya
 * pemanggilnya tetap bisa membedakan 403, 429, dan 503 seperti sebelumnya,
 * dan supaya badan galat Google sampai utuh ke pengklasifikasi galat.
 */
export async function panggilGemini(
  model: string, badan: BadanGemini, batasMs = BATAS_MS,
): Promise<Response> {
  return kirim({ model, ...badan }, batasMs)
}

/** Katalog model yang boleh dipakai kunci di server. */
export async function daftarModelGemini(): Promise<Response> {
  return kirim({ aksi: 'daftarModel' })
}


/**
 * Satu sesi kerja AI, dengan anggaran waktu yang dipegang bersama.
 *
 * Batas waktu per panggilan tidak pernah cukup untuk fitur yang punya
 * perulangan — dan hampir semuanya punya. RAB Excel mengulang tiap potongan
 * sampai empat kali, AI Architect merender tiga sudut dikali tiga model,
 * Marcom mencoba tiga model gambar. Dengan batas per panggilan, tiap
 * percobaan mendapat jatah penuh LAGI, sehingga pengaman yang dipasang untuk
 * menghentikan penungguan justru melipatgandakannya. Itu sudah terjadi sekali
 * di Chat AI: 75 detik menjadi lebih dari seratus, dan masih berputar.
 *
 * Sesi ini memindahkan anggarannya ke satu tempat. Yang membuatnya tahan
 * terhadap kelalaian: begitu anggarannya menipis, `panggil` MELEMPAR seketika
 * tanpa menyentuh jaringan. Jadi perulangan yang menelan galat dan lanjut ke
 * percobaan berikutnya pun akan habis dalam sekejap, bukan berjam-jam —
 * pemanggilnya tidak perlu ingat memeriksa apa pun.
 */
export interface SesiAi {
  /** Panggil satu model; melempar seketika bila anggarannya sudah menipis. */
  panggil(model: string, badan: BadanGemini): Promise<Response>
  sisaDetik(): number
  habis(): boolean
}

export function mulaiSesiAi(totalMs = 70_000, wajarMs = 45_000): SesiAi {
  const anggaran = buatAnggaran(totalMs)
  return {
    async panggil(model: string, badan: BadanGemini): Promise<Response> {
      if (!pantasDicobaLagi(anggaran)) throw galatWaktuHabis(Math.round(totalMs / 1000))
      return panggilGemini(model, badan, anggaran.jatah(wajarMs))
    },
    sisaDetik: () => Math.round(anggaran.sisa() / 1000),
    habis: () => anggaran.habis(),
  }
}
