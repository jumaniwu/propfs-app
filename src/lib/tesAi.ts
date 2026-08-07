// ============================================================
// PropFS — Menguji kunci Gemini, sekarang juga
//
// Ketika kunci AI ditolak, satu-satunya cara mengetahui apakah ia sudah pulih
// adalah membuka Chat AI, mengetik pesan, melampirkan foto, dan menunggu.
// Itu mahal untuk sebuah pertanyaan yang jawabannya cuma "sudah" atau "belum",
// dan setelah membereskan penagihan di Google orang perlu menanyakannya
// berkali-kali — perubahan izin di sisi Google tidak selalu berlaku seketika.
//
// Yang diuji hanya Gemini. Penyedia cadangan sudah dihapus dari aplikasi:
// keduanya melayani teks saja, sedangkan yang paling dipakai di sini adalah
// membaca foto nota — yang memang cuma bisa lewat Gemini. Menguji layanan yang
// tidak lagi dipanggil hanya menjawab pertanyaan yang tidak sedang ditanyakan.
//
// Sengaja TIDAK memakai model mahal maupun mengirim gambar: yang sedang
// ditanyakan adalah izin kuncinya, bukan kemampuan modelnya.
//
// Sejak kuncinya dipindah ke server, halaman ini tidak lagi memegang kunci apa
// pun — ia mengetuk /api/ai persis seperti fitur yang sesungguhnya. Itu justru
// membuat jawabannya lebih dapat dipercaya: yang diuji adalah jalur yang benar-
// benar dipakai, bukan tiruannya.
// ============================================================

import { batasWaktu } from './batasWaktu.ts'
import { jenisGalat, type JenisGalat } from './galatAi.ts'
import { diagnosaAi, type Diagnosa } from './diagnosaAi.ts'
import {
  saringModel, pilihModel, adaYangLebihBaik,
  MODEL_TEKS, type ModelGemini,
} from './modelAi.ts'
import { panggilGemini, daftarModelGemini } from './gemini.ts'

export interface HasilTes {
  /** Server punya kunci Gemini. */
  adaKunci: boolean
  ok: boolean
  /** Jenis kegagalan; null bila berhasil atau kuncinya memang belum dipasang. */
  jenis: JenisGalat | null
  /** Satu kalimat pendek, siap ditampilkan. */
  pesan: string
  /**
   * Sebab dan langkah perbaikannya. Inilah bedanya dengan sekadar "403":
   * empat keadaan berbeda sama-sama berbunyi 403, dan perbaikannya berlainan.
   */
  diagnosa: Diagnosa | null
  /** Lama menunggu, milidetik. */
  ms: number
  /**
   * Model yang BOLEH dipakai kunci ini, langsung dari katalog Google.
   * Kosong bila pengujiannya gagal — pertanyaannya belum sempat diajukan.
   */
  model: ModelGemini[]
  /** Model yang akan dipakai aplikasi untuk percakapan & baca foto. */
  modelDipakai: string | null
  /** Ada model yang lebih baik daripada yang biasa dipakai; null bila tidak. */
  modelLebihBaik: string | null
}

const env = (): Record<string, string | undefined> =>
  (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {}

// `kunciTerpasang()` dan `sidikKunci()` dihapus bersama kuncinya. Selama kunci
// masih ikut terbundel, menampilkan sidiknya berguna untuk mencocokkan dengan
// Google Console. Sekarang browser memang tidak memegang apa pun untuk
// dicocokkan — dan itulah perbaikannya, bukan kehilangan.

const PESAN: Record<JenisGalat, string> = {
  kunci: 'Ditolak — izin/kunci belum berlaku',
  kuota: 'Kuota habis',
  sibuk: 'Layanan sedang padat',
  jaringan: 'Tidak tersambung',
  lain: 'Ditolak dengan alasan yang tidak dikenali',
}

/**
 * Ketuk Gemini dengan permintaan sekecil mungkin.
 *
 * Tidak pernah melempar: yang ditanyakan adalah keadaan, dan "gagal" pun
 * merupakan jawaban yang harus sampai utuh ke layar.
 */
export async function tesKunciAi(): Promise<HasilTes> {
  const tiruan = (globalThis as { __tesAiMock?: () => Promise<HasilTes> }).__tesAiMock
  if (tiruan) return tiruan()

  const kosong = { model: [] as ModelGemini[], modelDipakai: null, modelLebihBaik: null }
  const mulai = Date.now()

  try {
    const res = await batasWaktu(panggilGemini(MODEL_TEKS[1], {
      contents: [{ parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 1 },
    }), 25000, null)
    const ms = Date.now() - mulai

    if (!res) {
      return {
        adaKunci: true, ok: false, jenis: 'jaringan', ms, ...kosong,
        pesan: 'Tidak menjawab dalam 25 detik',
        diagnosa: diagnosaAi(undefined, 'timeout'),
      }
    }

    const badan = await res.text().catch(() => '')

    if (res.ok) {
      // Kuncinya jalan; sekarang tanyakan model apa saja yang BOLEH dipakainya.
      // Menanyakan lebih murah dan lebih jujur daripada menebak nama lalu
      // menunggu 404 — dan jawabannya tidak pernah basi.
      const model = await daftarModelAi()
      return {
        adaKunci: true, ok: true, jenis: null, ms,
        model, modelDipakai: pilihModel(model, MODEL_TEKS),
        modelLebihBaik: adaYangLebihBaik(model, MODEL_DIPAKAI_SEKARANG),
        pesan: 'Berhasil', diagnosa: null,
      }
    }

    // Perantara menjawab dengan kalimatnya sendiri hanya untuk dua hal yang
    // memang urusannya: kunci server belum dipasang, dan pemanggil belum masuk.
    // Selain itu badan yang diteruskan adalah kalimat Google apa adanya.
    const adaKunci = !badan.includes('NO_SERVER_KEY')
    const jenis = jenisGalat(`${res.status} ${badan}`)
    return {
      adaKunci, ok: false, jenis, ms, ...kosong,
      pesan: adaKunci ? `${PESAN[jenis]} (${res.status})` : 'Kunci server belum dipasang',
      diagnosa: adaKunci ? diagnosaAi(res.status, badan) : {
        sebab: 'kunci_salah',
        apa: 'GEMINI_API_KEY belum dipasang di server.',
        perbaikan: 'Vercel → Settings → Environment Variables → tambahkan GEMINI_API_KEY '
          + '(TANPA awalan VITE_, supaya tidak ikut terbundel ke browser), lalu deploy ulang.',
        tautan: 'https://aistudio.google.com/apikey', asli: '', sisiKami: true,
      },
    }
  } catch (e) {
    const jenis = jenisGalat(e)
    return {
      adaKunci: true, ok: false, jenis, ms: Date.now() - mulai, ...kosong,
      pesan: PESAN[jenis],
      diagnosa: diagnosaAi(undefined, e instanceof Error ? e.message : e),
    }
  }
}

/**
 * Katalog model yang boleh dipakai sebuah kunci, langsung dari Google.
 *
 * Tidak pernah melempar: daftar kosong berarti pertanyaannya tidak terjawab,
 * dan itu tidak boleh menggagalkan pengujian kunci yang sudah berhasil.
 */
export async function daftarModelAi(): Promise<ModelGemini[]> {
  try {
    const res = await batasWaktu(daftarModelGemini(), 15000, null)
    if (!res || !res.ok) return []
    return saringModel(await res.json())
  } catch { return [] }
}

/**
 * Satu kalimat kesimpulan.
 *
 * Gemini adalah satu-satunya penyedia yang dipakai aplikasi, jadi keadaannya
 * langsung menentukan apakah Chat AI dan pembacaan foto nota bisa dipakai.
 */
/** Model yang dipakai jalur percakapan hari ini — dibandingkan dengan katalog. */
const MODEL_DIPAKAI_SEKARANG = 'gemini-2.5-flash'

export function kesimpulanTes(hasil: HasilTes | null): { siap: boolean; pesan: string } {
  if (!hasil) return { siap: false, pesan: 'Belum diuji.' }
  if (hasil.ok) return { siap: true, pesan: 'Gemini siap — Chat AI dan baca nota dari foto bisa dipakai.' }
  if (!hasil.adaKunci) return { siap: false, pesan: 'GEMINI_API_KEY belum dipasang di server.' }
  return { siap: false, pesan: hasil.diagnosa?.apa ?? 'Gemini belum bisa dipakai.' }
}
