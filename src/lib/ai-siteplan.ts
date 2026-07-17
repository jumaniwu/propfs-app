// ============================================================
// PropFS — AI Pembaca Draft Konsep Siteplan (vision)
// Membaca gambar coretan/draft perencanaan (mis. foto udara yang
// dicorat-coret arsitek) lalu mengembalikan rekomendasi konsep,
// posisi jalan utama, zona, dan parameter siteplan.
// Memakai infra AI yang sama dengan modul RAB (Gemini via env key).
// ============================================================

import type { SiteplanConcept } from '@/engine/siteplan/layout.ts'

export interface AIZone {
  /** jenis zona yang teridentifikasi, mis. "ruko", "apartemen", "commercial plaza" */
  type: string
  /** deskripsi posisi zona pada lahan, mis. "sepanjang jalan utama sisi barat" */
  posisi: string
}

export interface AIKonsepResult {
  concept: SiteplanConcept
  /** deskripsi posisi jalan utama relatif terhadap lahan (arah mata angin/sisi) */
  jalanUtama: string
  zones: AIZone[]
  /** saran parameter (opsional, hanya yang disebut AI) */
  params: Partial<{
    lotW: number; lotD: number
    rukoW: number; rukoD: number; rukoMax: number
    towerW: number; towerD: number; towerCount: number
    rthPct: number; fasumPct: number
  }>
  /** catatan/alasan penataan dari AI, bahasa Indonesia */
  notes: string
}

const VALID_CONCEPTS: SiteplanConcept[] = ['perumahan', 'ruko', 'apartemen', 'hotel', 'mixed']

const PROMPT = `Anda adalah arsitek perencana kawasan profesional dengan pengalaman puluhan tahun di Indonesia.
Analisis gambar berikut: sebuah draft/coretan konsep perencanaan di atas foto lahan (foto udara/sketsa).
Garis atau blok berwarna dan label teks pada gambar menandai zona yang direncanakan.

Identifikasi:
1. Konsep utama pembangunan. Pilih SATU: "perumahan", "ruko", "apartemen", "hotel", "mixed" (mixed = kombinasi komersial + hunian).
2. Posisi JALAN UTAMA (jalan raya eksisting terbesar) relatif terhadap lahan — sebutkan sisi/arah (mis. "sisi barat laut lahan, jalan raya besar di kiri gambar").
3. Zona-zona yang digambar (warna/label) beserta posisinya di lahan.
4. Saran parameter wajar untuk konsep tsb (dimensi kavling/ruko/tower dalam meter, jumlah tower, target RTH %).
5. Catatan penataan singkat ala arsitek profesional (aksesibilitas, orientasi komersial ke jalan utama, buffer hunian, dsb).

Balas HANYA JSON valid tanpa teks lain, format:
{"concept":"mixed","jalanUtama":"...","zones":[{"type":"ruko","posisi":"..."}],"params":{"rukoW":5,"rukoD":15,"towerW":20,"towerD":30,"towerCount":1,"lotW":6,"lotD":12,"rthPct":10},"notes":"..."}`

function fileToBase64(file: File): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const comma = url.indexOf(',')
      resolve({ data: url.slice(comma + 1), mime: file.type || 'image/jpeg' })
    }
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'))
    reader.readAsDataURL(file)
  })
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI tidak mengembalikan JSON yang valid.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function callGeminiVision(apiKey: string, image: { data: string; mime: string }): Promise<string> {
  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: image.mime, data: image.data } },
      ],
    }],
    generationConfig: { temperature: 0.2 },
  }
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
  let lastErr = ''
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (text) return text
      lastErr = 'Respons AI kosong.'
      continue
    }
    lastErr = `HTTP ${res.status}`
  }
  throw new Error(`Gagal memanggil AI (${lastErr}).`)
}

/** Analisis gambar draft konsep → rekomendasi terstruktur. */
export async function analyzeConceptSketch(file: File): Promise<AIKonsepResult> {
  // hook mock untuk pengujian E2E tanpa jaringan
  const mock = (window as { __aiSiteplanMock?: (f: File) => Promise<AIKonsepResult> }).__aiSiteplanMock
  if (mock) return mock(file)

  const geminiKey = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_GEMINI_API_KEY
  if (!geminiKey) {
    throw new Error('Fitur AI membutuhkan VITE_GEMINI_API_KEY (model vision). Hubungi admin untuk mengaktifkannya.')
  }

  const image = await fileToBase64(file)
  const raw = await callGeminiVision(geminiKey, image)
  const parsed = extractJson(raw) as Partial<AIKonsepResult> & { concept?: string }

  const concept = VALID_CONCEPTS.includes(parsed.concept as SiteplanConcept)
    ? (parsed.concept as SiteplanConcept)
    : 'mixed'

  return {
    concept,
    jalanUtama: String(parsed.jalanUtama ?? '').trim() || 'Tidak teridentifikasi — tandai manual dengan mengeklik sisi lahan.',
    zones: Array.isArray(parsed.zones)
      ? parsed.zones.map(z => ({ type: String(z.type ?? '-'), posisi: String(z.posisi ?? '-') }))
      : [],
    params: typeof parsed.params === 'object' && parsed.params ? parsed.params : {},
    notes: String(parsed.notes ?? '').trim(),
  }
}
