// ============================================================
// PropFS — Baca surat jalan / nota vendor jadi data DO
//
// Logistik memotret surat jalan di lapangan; AI membacanya jadi nomor DO,
// nomor nota, tanggal nota, dan daftar barang beserta qty yang datang.
//
// Penguraian jawabannya dipisah ke fungsi murni (uraiHasilDo) supaya bisa
// diuji tanpa memanggil jaringan — bagian inilah yang paling rawan, karena
// jawaban model tidak pernah benar-benar seragam.
// ============================================================

import type { DoItem } from './penerimaan'

export interface HasilBacaDo {
  nomor_do: string
  nomor_nota: string
  /** YYYY-MM-DD, atau null bila tidak terbaca. */
  tanggal_nota: string | null
  items: DoItem[]
  /** Catatan bebas dari model; ditampilkan apa adanya bila ada. */
  catatan: string
}

export const HASIL_KOSONG: HasilBacaDo = {
  nomor_do: '', nomor_nota: '', tanggal_nota: null, items: [], catatan: '',
}

/**
 * Selalu salinan baru. Menyebar `{ ...HASIL_KOSONG }` tidak cukup: salinan
 * dangkal tetap berbagi larik `items`, sehingga pemanggil yang menambah baris
 * ikut mengubah nilai bawaannya.
 */
function kosong(): HasilBacaDo {
  return { ...HASIL_KOSONG, items: [] }
}

const teks = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/**
 * Angka dari model bisa ditulis dengan gaya Indonesia ("1.250" = seribu dua
 * ratus lima puluh) maupun gaya Inggris ("1.25" = satu koma dua lima).
 *
 * Pembedanya:
 *   - Ada koma      → koma itu desimal, titik pemisah ribuan.  "1.250,75"
 *   - Titik + 3 digit berkelompok → titik itu pemisah ribuan.  "1.250"
 *   - Selain itu    → titik dianggap desimal.                  "1.5"
 */
export function angkaLonggar(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0
  const s = teks(x)
  if (!s) return 0
  const bersih = s.replace(/[^\d,.-]/g, '')

  let siap: string
  if (bersih.includes(',')) siap = bersih.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(bersih)) siap = bersih.replace(/\./g, '')
  else siap = bersih

  const n = Number(siap)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normalkan tanggal ke YYYY-MM-DD. Menerima bentuk yang lazim ditulis di nota
 * Indonesia (27/07/2026, 27-07-2026) selain bentuk ISO.
 */
export function tanggalLonggar(x: unknown): string | null {
  const s = teks(x)
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return sahkan(+iso[1], +iso[2], +iso[3])
  const id = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (id) {
    const th = +id[3] < 100 ? 2000 + +id[3] : +id[3]
    return sahkan(th, +id[2], +id[1])
  }
  return null
}

function sahkan(th: number, bl: number, hr: number): string | null {
  if (bl < 1 || bl > 12 || hr < 1 || hr > 31) return null
  const d = new Date(Date.UTC(th, bl - 1, hr))
  if (d.getUTCMonth() !== bl - 1 || d.getUTCDate() !== hr) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Ambil objek JSON dari jawaban model. Model sering membungkusnya dengan
 * ```json, mendahuluinya dengan kalimat pengantar, atau keduanya.
 */
export function uraiHasilDo(raw: string | null | undefined): HasilBacaDo {
  const s = teks(raw)
  if (!s) return kosong()

  const pagar = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const kandidat = pagar ? pagar[1] : s
  const mulai = kandidat.indexOf('{')
  const akhir = kandidat.lastIndexOf('}')
  if (mulai < 0 || akhir <= mulai) return kosong()

  let obj: Record<string, unknown>
  try { obj = JSON.parse(kandidat.slice(mulai, akhir + 1)) as Record<string, unknown> }
  catch { return kosong() }

  const daftar = Array.isArray(obj.items) ? obj.items : []
  const items: DoItem[] = daftar
    .map(x => {
      const it = (x ?? {}) as Record<string, unknown>
      return {
        nama: teks(it.nama),
        satuan: teks(it.satuan),
        qty: Math.max(0, angkaLonggar(it.qty)),
      }
    })
    // Baris tanpa nama tidak ada gunanya; qty nol masih berguna sebagai
    // penanda barang tercantum tapi belum dikirim.
    .filter(it => it.nama !== '')

  return {
    nomor_do: teks(obj.nomor_do),
    nomor_nota: teks(obj.nomor_nota),
    tanggal_nota: tanggalLonggar(obj.tanggal_nota),
    items,
    catatan: teks(obj.catatan),
  }
}

/** Perintah untuk model. Nama barang pada PO ikut dikirim sebagai acuan. */
export function instruksiBacaDo(namaBarangPo: string[]): string {
  const acuan = namaBarangPo.filter(Boolean).map(n => `- ${n}`).join('\n')
  return [
    'Anda membaca SURAT JALAN atau NOTA dari supplier material bangunan di Indonesia.',
    'Keluarkan HANYA satu objek JSON, tanpa kalimat pengantar, dengan bentuk:',
    '{"nomor_do":"","nomor_nota":"","tanggal_nota":"YYYY-MM-DD","items":[{"nama":"","satuan":"","qty":0}],"catatan":""}',
    '',
    'Aturan:',
    '- nomor_do  = nomor surat jalan / delivery order. Kosongkan bila tidak ada.',
    '- nomor_nota= nomor nota / invoice / faktur. Kosongkan bila tidak ada.',
    '- tanggal_nota = tanggal pada nota, format YYYY-MM-DD. Kosongkan bila tidak terbaca.',
    '- qty = jumlah yang BENAR-BENAR DIKIRIM pada dokumen ini, bukan jumlah pesanan.',
    '- Jangan mengarang angka. Bila ragu, kosongkan.',
    acuan ? `\nBarang yang dipesan pada PO ini (pakai nama ini bila cocok):\n${acuan}` : '',
  ].join('\n')
}

interface BerkasLampiran { mimeType: string; base64Data: string }

/**
 * Kirim foto/PDF surat jalan ke Gemini. Mengembalikan hasil kosong bila kunci
 * API tidak tersedia — pengisian manual tetap bisa dilakukan, jadi ketiadaan
 * AI tidak boleh menghentikan pencatatan barang datang.
 */
export async function bacaNotaDo(
  berkas: BerkasLampiran[],
  namaBarangPo: string[] = [],
  catatanTambahan = '',
): Promise<HasilBacaDo> {
  const key = (import.meta as unknown as { env: Record<string, string | undefined> })
    .env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('Fitur baca otomatis belum aktif — isi datanya manual dulu.')
  if (berkas.length === 0) throw new Error('Lampirkan foto surat jalan atau notanya dulu.')

  const parts: Array<Record<string, unknown>> = [
    { text: catatanTambahan.trim() || 'Baca dokumen ini.' },
    ...berkas.map(f => ({ inlineData: { data: f.base64Data, mimeType: f.mimeType } })),
  ]

  let galat = ''
  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instruksiBacaDo(namaBarangPo) }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
        },
      )
      if (!res.ok) { galat = `HTTP ${res.status}`; continue }
      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const teksJawab = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!teksJawab) { galat = 'jawaban kosong'; continue }
      return uraiHasilDo(teksJawab)
    } catch (e) {
      galat = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`Gagal membaca dokumen (${galat}). Isi datanya manual saja.`)
}
