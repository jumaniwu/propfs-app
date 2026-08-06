// ============================================================
// PropFS — AI Render Masterplan (image generation)
// Setelah siteplan disetujui: render visual bird-eye view
// fotorealistis dari beberapa sudut pandang memakai model
// image-generation Gemini (API key yang sama dengan modul AI lain).
// Data yang dikirim: gambar denah 2D + deskripsi kawasan terstruktur
// (konsep, jumlah unit, lebar jalan, RTH, gaya arsitektur, lantai).
// ============================================================

import type { SiteplanResult } from '@/engine/siteplan/layout.ts'
import { renderToCanvas } from '@/components/siteplan/exportImage.ts'
import { renderIsometric } from '@/components/siteplan/render3d.ts'
import { catatGambar } from '../store/usageStore'

export type RenderAngle = 'depan' | 'sudut' | 'belakang'
export type RenderStyle = 'modern-minimalis' | 'tropis' | 'klasik' | 'industrial'
export type RenderTime = 'siang' | 'senja'

export interface RenderOptions {
  style: RenderStyle
  timeOfDay: RenderTime
  floors: { rumah: number; ruko: number; tower: number }
  angles: RenderAngle[]
  /** dataURL coretan/draft user sebagai referensi zonasi (opsional) */
  sketchDataUrl?: string | null
}

export interface RenderedView {
  angle: RenderAngle
  label: string
  dataUrl: string
  /** 'ai' = foto realistis AI; 'skematik' = render 3D geometri akurat (fallback/tanpa key) */
  source: 'ai' | 'skematik'
}

export const RENDER_STYLE_LABELS: Record<RenderStyle, string> = {
  'modern-minimalis': 'Modern Minimalis',
  tropis: 'Tropis Kontemporer',
  klasik: 'Klasik',
  industrial: 'Industrial',
}

export const RENDER_ANGLE_LABELS: Record<RenderAngle, string> = {
  depan: 'Bird-eye dari Jalan Utama',
  sudut: 'Bird-eye Sudut 45°',
  belakang: 'Bird-eye dari Belakang',
}

/** rotasi denah untuk tiap sudut pandang skematik */
const ANGLE_DEG: Record<RenderAngle, number> = { depan: 0, sudut: 45, belakang: 180 }

/** Susun deskripsi kawasan terstruktur dari data siteplan. */
export function buildSceneDescription(result: SiteplanResult, opts: RenderOptions): string {
  const s = result.stats
  const prm = result.params
  const parts: string[] = []
  parts.push(`Kawasan seluas ${Math.round(s.totalAreaM2).toLocaleString('id-ID')} m² sesuai DENAH SITEPLAN terlampir (ikuti tata letak, bentuk lahan, dan jaringan jalan pada denah secara akurat).`)
  if (s.counts.kavling > 0) {
    parts.push(`${s.counts.kavling} rumah tapak ${prm.lot.w}×${prm.lot.d} m, ${opts.floors.rumah} lantai, atap pelana, carport, halaman kecil.`)
  }
  if (s.counts.komersial > 0) {
    parts.push(`${s.counts.komersial} unit ruko ${prm.commercial.w}×${prm.commercial.d} m, ${opts.floors.ruko} lantai, fasad toko menghadap jalan utama.`)
  }
  if (s.counts.tower > 0) {
    parts.push(`${s.counts.tower} tower ${prm.concept === 'hotel' ? 'hotel' : 'apartemen'} ${prm.tower?.w}×${prm.tower?.d} m setinggi ${opts.floors.tower} lantai dengan podium.`)
  }
  if (s.byType.plaza?.area > 0.5) {
    parts.push(`Bangunan foodcourt/commercial plaza ${prm.plaza?.w}×${prm.plaza?.d} m, 1-2 lantai, area kuliner semi-terbuka yang ramai.`)
  }
  if (s.byType.parkir?.area > 0.5) {
    parts.push(`Area parkir luas ${Math.round(s.byType.parkir.area).toLocaleString('id-ID')} m² dengan marka parkir.`)
  }
  parts.push(`Jalan utama lebar ${prm.road.main} m beraspal dengan marka, jalan lingkungan ${prm.road.secondary} m, trotoar dan lampu jalan.`)
  if (s.byType.rth?.area > 0.5) {
    parts.push(`Ruang terbuka hijau/taman ${Math.round(s.byType.rth.area).toLocaleString('id-ID')} m² dengan pepohonan tropis dan jalur pejalan.`)
  }
  if (s.byType.fasum?.area > 0.5) {
    parts.push('Bangunan fasilitas umum (clubhouse/musala) pada blok fasum.')
  }
  parts.push(`Gaya arsitektur: ${RENDER_STYLE_LABELS[opts.style]}, khas perumahan Indonesia modern.`)
  parts.push(opts.timeOfDay === 'senja'
    ? 'Suasana senja golden hour, lampu jalan dan lampu bangunan mulai menyala.'
    : 'Suasana siang cerah, langit biru sedikit awan, pencahayaan natural.')
  return parts.join(' ')
}

function buildPrompt(result: SiteplanResult, opts: RenderOptions): string {
  return `Anda adalah visualisator arsitektur profesional.
GAMBAR PERTAMA terlampir adalah MODEL 3D SKEMATIK kawasan dengan geometri PASTI: bentuk batas lahan, posisi, ukuran, dan tinggi SETIAP bangunan serta jaringan jalan sudah final.

TUGAS (image-to-image): ubah model skematik tersebut menjadi FOTO REALISTIS drone dengan SUDUT KAMERA, KOMPOSISI, PROPORSI, JUMLAH DAN POSISI BANGUNAN PERSIS SAMA dengan gambar pertama.
LARANGAN KERAS: jangan menambah, mengurangi, memindahkan, atau mengubah bentuk bangunan/jalan/zona; jangan mengubah bentuk batas lahan; jangan mengganti sudut kamera.

Panduan warna skematik: oranye=rumah (atap genteng), ungu=ruko, biru keunguan=tower, cyan=foodcourt/plaza, abu=jalan aspal, hijau=taman/RTH, biru=fasum, abu terang=parkir.

DETAIL MATERIAL & SUASANA:
${buildSceneDescription(result, opts)}
${opts.sketchDataUrl ? '\nGAMBAR KEDUA adalah foto udara lokasi asli dengan coretan konsep: gunakan HANYA untuk konteks lingkungan sekitar (jalan raya eksisting, vegetasi, bangunan tetangga). Geometri kawasan tetap 100% mengikuti gambar pertama.' : '\nLingkungan sekitar: lahan hijau dan jalan raya eksisting di sisi depan kawasan.'}
- Fotorealistis kualitas presentasi developer, rasio 16:9 landscape.`
}

/** Model gambar yang dicoba lebih dulu — dan yang tarifnya dipakai mencatat. */
const MODEL_GAMBAR_UTAMA = 'gemini-2.5-flash-image'

async function callGeminiImage(
  apiKey: string, prompt: string, planPngBase64: string, sketch?: { mime: string; data: string } | null,
): Promise<string> {
  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    { inline_data: { mime_type: 'image/png', data: planPngBase64 } },
  ]
  if (sketch) parts.push({ inline_data: { mime_type: sketch.mime, data: sketch.data } })
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }
  const models = [MODEL_GAMBAR_UTAMA, 'gemini-2.0-flash-preview-image-generation']
  let lastErr = ''
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      lastErr = `HTTP ${res.status}`
      continue
    }
    const data = await res.json()
    const imgPart = (data.candidates?.[0]?.content?.parts ?? []).find(
      (p: { inlineData?: { data?: string }; inline_data?: { data?: string } }) =>
        p.inlineData?.data || p.inline_data?.data,
    )
    const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data
    if (b64) return `data:image/png;base64,${b64}`
    lastErr = 'Model tidak mengembalikan gambar.'
  }
  throw new Error(`Render gagal (${lastErr}).`)
}

/** Render masterplan dari beberapa sudut pandang. */
export async function renderMasterplanViews(
  result: SiteplanResult,
  opts: RenderOptions,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<RenderedView[]> {
  // hook mock untuk pengujian E2E tanpa jaringan
  const mock = (window as {
    __aiRenderMock?: (opts: RenderOptions) => Promise<RenderedView[]>
  }).__aiRenderMock
  if (mock) return (await mock(opts)).map(v => ({ ...v, source: v.source ?? ('ai' as const) }))

  const geminiKey = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_GEMINI_API_KEY

  const sketch = opts.sketchDataUrl
    ? {
        mime: opts.sketchDataUrl.slice(5, opts.sketchDataUrl.indexOf(';')),
        data: opts.sketchDataUrl.slice(opts.sketchDataUrl.indexOf(',') + 1),
      }
    : null

  const views: RenderedView[] = []
  for (let i = 0; i < opts.angles.length; i++) {
    const angle = opts.angles[i]
    onProgress?.(i, opts.angles.length, RENDER_ANGLE_LABELS[angle])
    // 1) render 3D skematik dengan geometri pasti untuk sudut ini
    const schematic = renderIsometric(result, {
      angleDeg: ANGLE_DEG[angle],
      floors: opts.floors,
    })
    const schematicUrl = schematic.toDataURL('image/png')
    // 2) AI memfotorealistiskan skematik (geometri dipertahankan);
    //    tanpa key / gagal → tampilkan skematiknya langsung
    if (geminiKey) {
      try {
        const prompt = buildPrompt(result, opts)
        const dataUrl = await callGeminiImage(
          geminiKey, prompt, schematicUrl.split(',')[1], sketch,
        )
        // Satu sudut = satu gambar berbayar. Merender tiga sudut sekaligus
        // adalah pemakaian biasa, jadi yang terasa "sekali tekan" sebenarnya
        // tiga kali bayar — dan sebelumnya tak satu pun dari tiga itu tercatat.
        catatGambar('render_masterplan', MODEL_GAMBAR_UTAMA, 1, prompt)
        views.push({ angle, label: RENDER_ANGLE_LABELS[angle], dataUrl, source: 'ai' })
        onProgress?.(i + 1, opts.angles.length, RENDER_ANGLE_LABELS[angle])
        continue
      } catch {
        // jatuh ke skematik di bawah
      }
    }
    views.push({
      angle,
      label: RENDER_ANGLE_LABELS[angle],
      dataUrl: schematicUrl,
      source: 'skematik',
    })
    onProgress?.(i + 1, opts.angles.length, RENDER_ANGLE_LABELS[angle])
  }
  return views
}
