// ============================================================
// PropFS — Render Konsep dari File Desain (AutoCAD/PDF/gambar)
// Alur: upload siteplan jadi → AI membaca denah → AI mengajukan
// pertanyaan konsep (jenis bangunan, lantai, gaya, dll.) → user
// menjawab → AI me-render bird-eye view mengikuti denah tsb.
// ============================================================

export interface CadQuestion {
  id: string
  question: string
  type: 'select' | 'number' | 'text'
  options?: string[]
  default?: string | number
}

export interface CadAnalysis {
  deskripsi: string
  questions: CadQuestion[]
}

export type CadAngle = 'depan' | 'sudut' | 'atas'

export const CAD_ANGLE_LABELS: Record<CadAngle, string> = {
  depan: 'Bird-eye dari Depan',
  sudut: 'Bird-eye Sudut 45°',
  atas: 'Top-down (tegak lurus)',
}

export interface CadRenderedView {
  angle: CadAngle
  label: string
  dataUrl: string
}

const GEMINI_TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation']

type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

function getKey(): string {
  const key = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('Fitur AI membutuhkan VITE_GEMINI_API_KEY. Hubungi admin untuk mengaktifkannya.')
  return key
}

async function callGemini(models: string[], parts: Part[], imageOut: boolean): Promise<{ text: string; image: string | null }> {
  const key = getKey()
  const body = {
    contents: [{ parts }],
    generationConfig: imageOut ? { responseModalities: ['TEXT', 'IMAGE'] } : { temperature: 0.3 },
  }
  let lastErr = ''
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (!res.ok) { lastErr = `HTTP ${res.status}`; continue }
    const data = await res.json()
    const outParts: Array<{ text?: string; inlineData?: { data?: string }; inline_data?: { data?: string } }> =
      data.candidates?.[0]?.content?.parts ?? []
    const text = outParts.map(p => p.text ?? '').join('')
    const img = outParts.find(p => p.inlineData?.data || p.inline_data?.data)
    const b64 = img?.inlineData?.data ?? img?.inline_data?.data ?? null
    if (text || b64) return { text, image: b64 ? `data:image/png;base64,${b64}` : null }
    lastErr = 'Respons AI kosong.'
  }
  throw new Error(`Gagal memanggil AI (${lastErr}).`)
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI tidak mengembalikan JSON yang valid.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

const dataUrlToPart = (u: string): Part => ({
  inline_data: { mime_type: u.slice(5, u.indexOf(';')), data: u.slice(u.indexOf(',') + 1) },
})

/** Pertanyaan baku bila AI tidak tersedia/gagal — alur tetap jalan. */
export function fallbackQuestions(): CadQuestion[] {
  return [
    { id: 'jenis', question: 'Jenis kawasan pada denah ini?', type: 'select', options: ['Perumahan', 'Ruko/Komersial', 'Apartemen', 'Hotel', 'Mixed-Use'], default: 'Perumahan' },
    { id: 'lantai_rumah', question: 'Jumlah lantai rumah', type: 'number', default: 1 },
    { id: 'lantai_ruko', question: 'Jumlah lantai ruko (jika ada)', type: 'number', default: 2 },
    { id: 'lantai_tower', question: 'Jumlah lantai tower (jika ada)', type: 'number', default: 12 },
    { id: 'gaya', question: 'Gaya arsitektur', type: 'select', options: ['Modern Minimalis', 'Tropis Kontemporer', 'Klasik', 'Industrial'], default: 'Modern Minimalis' },
    { id: 'jalan_utama', question: 'Sisi jalan utama pada gambar', type: 'select', options: ['Bawah', 'Atas', 'Kiri', 'Kanan'], default: 'Bawah' },
    { id: 'suasana', question: 'Suasana render', type: 'select', options: ['Siang cerah', 'Senja (golden hour)'], default: 'Siang cerah' },
  ]
}

const ANALYZE_PROMPT = `Anda adalah arsitek visualisator profesional Indonesia.
Gambar terlampir adalah DENAH SITEPLAN hasil desain (dari AutoCAD/PDF).

Tugas:
1. "deskripsi": jelaskan singkat apa yang terlihat pada denah. WAJIB sebutkan BENTUK BATAS LAHAN secara eksplisit (mis. segitiga, persegi panjang, trapesium, huruf L), lalu zona/blok bangunan (termasuk warna zonanya bila ada), jalan, dan area hijau.
2. "questions": susun daftar pertanyaan yang PERLU dijawab user agar Anda bisa membuat render 3D fotorealistis yang akurat dari denah ini.
   - Tanyakan hal yang TIDAK terlihat dari denah 2D: jenis/fungsi tiap zona bangunan yang Anda temukan, jumlah lantai per jenis, gaya arsitektur, material/warna dominan, sisi jalan utama, suasana.
   - Maksimal 8 pertanyaan, spesifik terhadap denah ini (sebut zona yang Anda lihat).
   - Tiap pertanyaan: {"id":"snake_case","question":"...","type":"select"|"number"|"text","options":[...],"default":...}
   - Untuk type "select" WAJIB beri "options" (3-6 pilihan) dan "default".

Balas HANYA JSON valid: {"deskripsi":"...","questions":[...]}`

/** Analisis denah + susun pertanyaan konsep. */
export async function analyzeCadPlan(imageDataUrls: string[]): Promise<CadAnalysis> {
  const mock = (window as { __aiCadMock?: (n: number) => Promise<CadAnalysis> }).__aiCadMock
  if (mock) return mock(imageDataUrls.length)

  const parts: Part[] = [{ text: ANALYZE_PROMPT }, ...imageDataUrls.map(dataUrlToPart)]
  const { text } = await callGemini(GEMINI_TEXT_MODELS, parts, false)
  const parsed = extractJson(text) as Partial<CadAnalysis>
  const questions: CadQuestion[] = Array.isArray(parsed.questions)
    ? parsed.questions
        .filter(q => q && typeof q.question === 'string')
        .slice(0, 8)
        .map((q, i) => ({
          id: String(q.id ?? `q${i}`),
          question: String(q.question),
          type: q.type === 'number' || q.type === 'text' ? q.type : 'select',
          options: Array.isArray(q.options) ? q.options.map(String) : undefined,
          default: q.default as string | number | undefined,
        }))
    : []
  return {
    deskripsi: String(parsed.deskripsi ?? '').trim() || 'Denah siteplan terdeteksi.',
    questions: questions.length ? questions : fallbackQuestions(),
  }
}

const CAD_ANGLE_PROMPTS: Record<CadAngle, string> = {
  depan: 'Kamera drone bird-eye rendah (~40°) dari sisi JALAN UTAMA sesuai jawaban user, menghadap ke dalam kawasan.',
  sudut: 'Kamera drone bird-eye dari sudut 45° diagonal kawasan, memperlihatkan kedalaman blok bangunan.',
  atas: 'Kamera tegak lurus dari atas (top-down) seperti foto satelit resolusi tinggi.',
}

/** Render bird-eye dari denah + jawaban konsep user. */
export async function renderCadViews(
  planDataUrl: string,
  analysis: CadAnalysis,
  answers: Record<string, string | number>,
  angles: CadAngle[],
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<CadRenderedView[]> {
  const mock = (window as {
    __aiCadRenderMock?: (angles: CadAngle[]) => Promise<CadRenderedView[]>
  }).__aiCadRenderMock
  if (mock) return mock(angles)

  const answerLines = analysis.questions
    .map(q => `- ${q.question}: ${answers[q.id] ?? q.default ?? '-'}`)
    .join('\n')

  const views: CadRenderedView[] = []
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i]
    onProgress?.(i, angles.length, CAD_ANGLE_LABELS[angle])
    const prompt = `Anda adalah visualisator arsitektur profesional.
GAMBAR terlampir adalah DENAH SITEPLAN FINAL dari AutoCAD — ini GROUND TRUTH tata letak. Warna pada denah menandai zona bangunan yang berbeda.

TUGAS: bayangkan denah ini DIEKSTRUSI ke 3D lalu difoto drone — buat SATU render FOTOREALISTIS dari hasil ekstrusi itu, BUKAN kawasan baru yang "mirip".

ATURAN MUTLAK (pelanggaran = gagal):
1. BENTUK BATAS LAHAN identik dengan denah. Jika lahan berbentuk segitiga, kawasan pada render HARUS segitiga — jangan diubah menjadi persegi/bentuk lain.
2. Jumlah, posisi, orientasi, dan proporsi SETIAP blok/deret bangunan sama persis dengan denah — dilarang menambah, mengurangi, atau memindahkan blok.
3. Jaringan jalan, parkir, dan area hijau berada di posisi yang sama dengan denah.
4. Sebelum menghasilkan gambar, verifikasi: garis luar kawasan pada render harus bisa di-overlay pas di atas garis luar denah.

DENAH MENURUT ANALISIS:
${analysis.deskripsi}

KONSEP DARI USER (jawaban kuesioner):
${answerLines}

SUDUT PANDANG:
${CAD_ANGLE_PROMPTS[angle]}

- Fotorealistis kualitas presentasi developer properti, rasio 16:9 landscape.`
    const { image } = await callGemini(
      GEMINI_IMAGE_MODELS,
      [{ text: prompt }, dataUrlToPart(planDataUrl)],
      true,
    )
    if (!image) throw new Error('Model tidak mengembalikan gambar.')
    views.push({ angle, label: CAD_ANGLE_LABELS[angle], dataUrl: image })
    onProgress?.(i + 1, angles.length, CAD_ANGLE_LABELS[angle])
  }
  return views
}
