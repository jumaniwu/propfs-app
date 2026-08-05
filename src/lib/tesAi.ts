// ============================================================
// PropFS — Menguji kunci layanan AI, sekarang juga
//
// Ketika kunci AI ditolak, satu-satunya cara mengetahui apakah ia sudah pulih
// adalah membuka Chat AI, mengetik pesan, melampirkan foto, dan menunggu.
// Itu mahal untuk sebuah pertanyaan yang jawabannya cuma "sudah" atau "belum",
// dan setelah membereskan penagihan di Google orang perlu menanyakannya
// berkali-kali — perubahan izin di sisi Google tidak selalu berlaku seketika.
//
// Modul ini mengetuk tiap penyedia dengan permintaan sekecil mungkin dan
// melaporkan APA yang dijawab: berhasil, ditolak izinnya, kehabisan kuota,
// sedang padat, atau jaringannya yang putus. Bukan "gagal" saja.
//
// Sengaja TIDAK memakai model yang mahal maupun mengirim gambar: yang sedang
// ditanyakan adalah izin kuncinya, bukan kemampuan modelnya.
// ============================================================

import { batasWaktu } from './batasWaktu.ts'
import { jenisGalat, type JenisGalat } from './galatAi.ts'

export type Penyedia = 'Gemini' | 'OpenRouter' | 'Groq'

export interface HasilTes {
  penyedia: Penyedia
  /** Kuncinya terpasang di lingkungan aplikasi. */
  adaKunci: boolean
  ok: boolean
  /** Jenis kegagalan; null bila berhasil atau kuncinya memang belum dipasang. */
  jenis: JenisGalat | null
  /** Satu kalimat pendek, siap ditampilkan. */
  pesan: string
  /** Lama menunggu, milidetik. */
  ms: number
}

const env = (): Record<string, string | undefined> =>
  (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {}

const PESAN: Record<JenisGalat, string> = {
  kunci: 'Ditolak — izin/kunci belum berlaku',
  kuota: 'Kuota habis',
  sibuk: 'Layanan sedang padat',
  jaringan: 'Tidak tersambung',
  lain: 'Ditolak dengan alasan yang tidak dikenali',
}

/** Ambil sebab ringkas dari badan respons, untuk ditempelkan ke pesan. */
function sebab(teks: string): string {
  const kode = /"code"\s*:\s*(\d{3})/.exec(teks)?.[1] ?? ''
  const status = /"status"\s*:\s*"([A-Z_]+)"/.exec(teks)?.[1] ?? ''
  return [kode, status].filter(Boolean).join(' ')
}

async function ketuk(
  penyedia: Penyedia,
  kunci: string | undefined,
  jalankan: (k: string) => Promise<Response>,
): Promise<HasilTes> {
  const mulai = Date.now()
  const k = (kunci ?? '').trim()
  if (!k) {
    return { penyedia, adaKunci: false, ok: false, jenis: null, pesan: 'Kunci belum dipasang', ms: 0 }
  }

  try {
    const res = await batasWaktu(jalankan(k), 20000, null)
    const ms = Date.now() - mulai
    if (!res) return { penyedia, adaKunci: true, ok: false, jenis: 'jaringan', pesan: 'Tidak menjawab dalam 20 detik', ms }
    if (res.ok) return { penyedia, adaKunci: true, ok: true, jenis: null, pesan: 'Berhasil', ms }

    const teks = await res.text().catch(() => '')
    const jenis = jenisGalat(`${res.status} ${teks}`)
    const rinci = sebab(teks) || String(res.status)
    return { penyedia, adaKunci: true, ok: false, jenis, pesan: `${PESAN[jenis]} (${rinci})`, ms }
  } catch (e) {
    const jenis = jenisGalat(e)
    return { penyedia, adaKunci: true, ok: false, jenis, pesan: PESAN[jenis], ms: Date.now() - mulai }
  }
}

/**
 * Ketuk semua penyedia AI yang kuncinya terpasang.
 *
 * Dijalankan berbarengan: yang ditunggu pemakainya adalah penyedia terlambat,
 * bukan jumlah seluruhnya. Tidak pernah melempar — setiap penyedia melaporkan
 * keadaannya sendiri, dan satu yang mati tidak menyembunyikan yang lain.
 */
export async function tesKunciAi(): Promise<HasilTes[]> {
  const tiruan = (globalThis as { __tesAiMock?: () => Promise<HasilTes[]> }).__tesAiMock
  if (tiruan) return tiruan()

  const e = env()
  const badanKecil = { contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }

  return Promise.all([
    ketuk('Gemini', e.VITE_GEMINI_API_KEY, k => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${k}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(badanKecil) },
    )),
    ketuk('OpenRouter', e.VITE_OPENROUTER_API_KEY, k => fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout:free', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      },
    )),
    ketuk('Groq', e.VITE_GROQ_API_KEY, k => fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      },
    )),
  ])
}

/**
 * Satu kalimat kesimpulan dari seluruh hasil.
 *
 * Yang menentukan bukan berapa banyak yang berhasil, melainkan apakah
 * pembacaan FOTO bisa jalan — dan itu hanya Gemini. OpenRouter dan Groq
 * melayani teks saja, jadi "dua dari tiga berhasil" bisa berarti fitur yang
 * paling dikeluhkan tetap mati.
 */
export function kesimpulanTes(hasil: HasilTes[]): { siap: boolean; pesan: string } {
  const gemini = (hasil ?? []).find(h => h.penyedia === 'Gemini')
  const adaTeks = (hasil ?? []).some(h => h.ok)

  if (gemini?.ok) return { siap: true, pesan: 'Semua siap — baca nota dari foto sudah bisa dipakai.' }
  if (adaTeks) {
    return {
      siap: false,
      pesan: 'Chat teks bisa jalan, tetapi BACA FOTO belum: itu hanya lewat Gemini, dan Gemini masih menolak.',
    }
  }
  if (!(hasil ?? []).some(h => h.adaKunci)) {
    return { siap: false, pesan: 'Belum ada satu pun kunci AI yang terpasang di aplikasi.' }
  }
  return { siap: false, pesan: 'Belum ada penyedia AI yang bisa dipakai.' }
}
