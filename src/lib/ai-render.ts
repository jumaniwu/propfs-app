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
import { modelUntukMutu, MUTU_BAWAAN, type MutuGambar } from './mutuGambar'
import { mulaiSesiAi, type SesiAi } from './gemini'

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
  /**
   * Mutu render. Bawaannya HEMAT — dan itu disengaja.
   *
   * Tidak dibuat wajib supaya pemanggil lama tidak berubah perilakunya; tetapi
   * yang tidak menyebutkannya mendapat jalur murah, bukan jalur termahal.
   * Kebalikannya yang dulu terjadi, dan tagihannya Rp 530 ribu sehari.
   */
  mutu?: MutuGambar
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

/**
 * Merender satu gambar, dan MENGEMBALIKAN model yang benar-benar menjawab.
 *
 * Nama modelnya ikut keluar, tidak lagi ditebak pemanggilnya. Versi lama
 * mencatat konstanta `MODEL_GAMBAR_UTAMA = 'gemini-2.5-flash-image'` — nama
 * yang berhenti benar begitu model Pro disisipkan ke depan daftar, sehingga
 * setiap gambar termahal tercatat dengan tarif yang termurah. Cacat seperti
 * itu tidak mungkin terlihat dari kode pemanggilnya; satu-satunya
 * pencegahannya adalah tidak menyimpan jawabannya di dua tempat.
 */
async function callGeminiImage(
  ai: SesiAi, prompt: string, planPngBase64: string,
  sketch: { mime: string; data: string } | null | undefined,
  daftarModel: readonly string[],
): Promise<{ dataUrl: string; model: string }> {
  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    { inline_data: { mime_type: 'image/png', data: planPngBase64 } },
  ]
  if (sketch) parts.push({ inline_data: { mime_type: sketch.mime, data: sketch.data } })
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }
  let lastErr = ''
  for (const model of daftarModel) {
    const res = await ai.panggil(model, body)
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
    if (b64) return { dataUrl: `data:image/png;base64,${b64}`, model }
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

  // Tidak ada lagi kunci yang bisa diperiksa dari sini — dan itulah
  // perbaikannya. Bila kunci server belum dipasang, /api/ai menjawabnya sendiri
  // dengan kalimat yang jelas.

  const sketch = opts.sketchDataUrl
    ? {
        mime: opts.sketchDataUrl.slice(5, opts.sketchDataUrl.indexOf(';')),
        data: opts.sketchDataUrl.slice(opts.sketchDataUrl.indexOf(',') + 1),
      }
    : null

  // Tiap gambar BERBAYAR, jadi perulangan yang tak berujung bukan cuma
  // membuang waktu — ia membuang uang. Anggarannya longgar karena membuat
  // gambar memang lama, tetapi ia tetap punya akhir.
  const ai = mulaiSesiAi(180_000, 60_000)
  const daftarModel = modelUntukMutu(opts.mutu ?? MUTU_BAWAAN)
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
    {
      try {
        const prompt = buildPrompt(result, opts)
        const hasil = await callGeminiImage(
          ai, prompt, schematicUrl.split(',')[1], sketch, daftarModel,
        )
        const dataUrl = hasil.dataUrl
        // Satu sudut = satu gambar berbayar. Merender tiga sudut sekaligus
        // adalah pemakaian biasa, jadi yang terasa "sekali tekan" sebenarnya
        // tiga kali bayar — dan sebelumnya tak satu pun dari tiga itu tercatat.
        //
        // Yang dicatat adalah model yang BENAR-BENAR menjawab, bukan tebakan.
        catatGambar('render_masterplan', hasil.model, 1, prompt)
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
