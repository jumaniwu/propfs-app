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
// ============================================================

import { batasWaktu } from './batasWaktu.ts'
import { jenisGalat, type JenisGalat } from './galatAi.ts'
import { diagnosaAi, type Diagnosa } from './diagnosaAi.ts'
import {
  periksaKunci, saringModel, pilihModel, adaYangLebihBaik,
  MODEL_TEKS, type ModelGemini, type PeriksaKunci,
} from './modelAi.ts'

export interface HasilTes {
  /** Kuncinya terpasang di lingkungan aplikasi. */
  adaKunci: boolean
  /** Kunci mana yang barusan diuji. */
  sumberKunci: 'aplikasi' | 'manual'
  /**
   * Sidik kunci yang diuji — cukup untuk MENCOCOKKAN dengan kunci di Google
   * Console, tidak cukup untuk dipakai. Tanpa ini tidak ada cara memastikan
   * bahwa kunci yang benar-benar dipakai aplikasi adalah kunci yang dikira.
   */
  sidik: string
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
  /** Bentuk kuncinya benar sebelum dikirim. */
  periksa: PeriksaKunci
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

/** Kunci yang benar-benar terpasang di build yang sedang berjalan. */
export const kunciTerpasang = (): string => (env().VITE_GEMINI_API_KEY ?? '').trim()

/**
 * Sidik kunci: awal, akhir, dan panjangnya.
 *
 * Setelah membayar, sebab 403 yang paling sering adalah kunci yang berasal dari
 * project LAIN — bukan project yang dibayar. Menyamakan kunci di aplikasi
 * dengan kunci di Google Console adalah cara tercepat membuktikannya, dan itu
 * mustahil bila kuncinya tak terlihat sama sekali. Yang ditampilkan sengaja
 * tidak cukup untuk dipakai orang lain.
 */
export function sidikKunci(kunci: unknown): string {
  const k = String(kunci ?? '').trim()
  if (!k) return '(kosong)'
  if (k.length <= 12) return `${'•'.repeat(k.length)} · ${k.length} karakter`
  return `${k.slice(0, 6)}…${k.slice(-4)} · ${k.length} karakter`
}

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
export async function tesKunciAi(kunciManual?: string): Promise<HasilTes> {
  const tiruan = (globalThis as {
    __tesAiMock?: (k?: string) => Promise<HasilTes>
  }).__tesAiMock
  if (tiruan) return tiruan(kunciManual)

  // Kunci yang diketik manual TIDAK disimpan di mana pun: ia hidup selama satu
  // panggilan lalu hilang. Gunanya menghapus siklus deploy dari proses
  // coba-coba — kunci baru bisa dibuktikan dalam hitungan detik, bukan setelah
  // mengubah environment variable dan menunggu build.
  const manual = (kunciManual ?? '').trim()
  const sumberKunci: 'aplikasi' | 'manual' = manual ? 'manual' : 'aplikasi'
  const kunci = manual || kunciTerpasang()
  const sidik = sidikKunci(kunci)
  const periksa = periksaKunci(kunci)
  const kosong = { model: [] as ModelGemini[], modelDipakai: null, modelLebihBaik: null }

  if (!kunci) {
    return {
      adaKunci: false, ok: false, jenis: null, ms: 0, sumberKunci, sidik, periksa, ...kosong,
      pesan: 'Kunci belum dipasang',
      diagnosa: diagnosaAi(undefined, 'No Gemini key'),
    }
  }

  // Kredensial yang salah jenis dihentikan di sini. Mengirimnya hanya
  // menghasilkan 401/403 yang bunyinya sama dengan kunci sah yang belum
  // diizinkan — dan sebab yang sebenarnya jadi tertutup lagi.
  if (!periksa.layak) {
    return {
      adaKunci: true, ok: false, jenis: 'kunci', ms: 0, sumberKunci, sidik, periksa, ...kosong,
      pesan: 'Bentuk kuncinya tidak benar',
      diagnosa: {
        sebab: 'kunci_salah', apa: periksa.pesan,
        perbaikan: 'Ambil API key di Google AI Studio, lalu uji ulang di sini.',
        tautan: 'https://aistudio.google.com/apikey', asli: '', sisiKami: true,
      },
    }
  }

  const mulai = Date.now()
  try {
    const res = await batasWaktu(fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${kunci}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      },
    ), 20000, null)
    const ms = Date.now() - mulai

    if (!res) {
      return {
        adaKunci: true, ok: false, jenis: 'jaringan', ms, sumberKunci, sidik, periksa, ...kosong,
        pesan: 'Tidak menjawab dalam 20 detik',
        diagnosa: diagnosaAi(undefined, 'timeout'),
      }
    }
    if (res.ok) {
      // Kuncinya jalan; sekarang tanyakan model apa saja yang BOLEH dipakainya.
      // Menanyakan lebih murah dan lebih jujur daripada menebak nama lalu
      // menunggu 404 — dan jawabannya tidak pernah basi.
      const model = await daftarModelAi(kunci)
      const modelDipakai = pilihModel(model, MODEL_TEKS)
      return {
        adaKunci: true, ok: true, jenis: null, ms, sumberKunci, sidik, periksa,
        model, modelDipakai,
        modelLebihBaik: adaYangLebihBaik(model, MODEL_DIPAKAI_SEKARANG),
        pesan: 'Berhasil', diagnosa: null,
      }
    }

    const badan = await res.text().catch(() => '')
    const jenis = jenisGalat(`${res.status} ${badan}`)
    return {
      adaKunci: true, ok: false, jenis, ms, sumberKunci, sidik, periksa, ...kosong,
      pesan: `${PESAN[jenis]} (${res.status})`,
      diagnosa: diagnosaAi(res.status, badan),
    }
  } catch (e) {
    const jenis = jenisGalat(e)
    return {
      adaKunci: true, ok: false, jenis, ms: Date.now() - mulai, sumberKunci, sidik, periksa, ...kosong,
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
export async function daftarModelAi(kunci: string): Promise<ModelGemini[]> {
  try {
    const res = await batasWaktu(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${kunci}&pageSize=200`),
      15000, null,
    )
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
  if (hasil.ok) {
    // Kunci manual yang berhasil sementara kunci aplikasi gagal adalah temuan,
    // bukan keberhasilan: artinya kuncinya sudah benar tetapi belum terpasang.
    return hasil.sumberKunci === 'manual'
      ? { siap: false, pesan: 'Kunci yang Anda ketik BERHASIL. Pasang kunci ini di Vercel sebagai VITE_GEMINI_API_KEY, lalu deploy ulang.' }
      : { siap: true, pesan: 'Gemini siap — Chat AI dan baca nota dari foto bisa dipakai.' }
  }
  if (!hasil.adaKunci) return { siap: false, pesan: 'Kunci Gemini belum terpasang di aplikasi.' }
  return { siap: false, pesan: hasil.diagnosa?.apa ?? 'Gemini belum bisa dipakai.' }
}
