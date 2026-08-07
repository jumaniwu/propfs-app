// ============================================================
// PropFS — Marcom: kata-kata & perapian foto oleh AI
//
// Dua pekerjaan yang paling sering menghentikan orang sebelum memposting:
// memikirkan kalimatnya, dan merasa fotonya "kurang bagus". Keduanya ditangani
// di sini.
//
// Satu aturan yang dipegang di seluruh berkas ini: TANPA KUNCI AI PUN FITURNYA
// TETAP JALAN. Caption jatuh ke naskah dari data proyek yang sudah ada, dan
// fotonya dipakai apa adanya. Fitur yang mati total begitu satu kunci tidak
// terpasang bukan fitur — ia jebakan.
//
// Perapian foto sengaja DIBATASI pada pencahayaan dan warna. Model gambar
// dengan senang hati akan "memperbaiki" bangunannya juga — menambah lantai,
// merapikan tembok yang belum jadi — dan hasilnya bukan lagi foto proyek,
// melainkan gambar yang menyesatkan calon pelanggan.
// ============================================================

import { batasWaktu } from './batasWaktu.ts'
import type { ProfilMarcom } from './marcom.ts'
import { bersihkanHashtag, namaTampil } from './marcom.ts'
import { catatGambar } from '../store/usageStore'
import { MODEL_GAMBAR, MODEL_TEKS } from './modelAi'
import { panggilGemini } from './gemini'

const kunci = (): string =>
  ''  // kunci sudah pindah ke server; lihat gemini.ts

export type GayaCaption = 'progres' | 'selesai' | 'promo' | 'edukasi'

export const GAYA_CAPTION: Record<GayaCaption, { label: string; arahan: string }> = {
  progres: {
    label: 'Update Progres',
    arahan: 'Laporan kemajuan pekerjaan yang membangun kepercayaan. Sebut tahap yang terlihat di foto.',
  },
  selesai: {
    label: 'Proyek Selesai',
    arahan: 'Rayakan serah terima. Tekankan hasil akhir, ketepatan waktu, dan kepuasan pemilik.',
  },
  promo: {
    label: 'Penawaran / Promo',
    arahan: 'Ajak calon pelanggan berkonsultasi. Tonjolkan keunggulan pengerjaan, bukan potongan harga.',
  },
  edukasi: {
    label: 'Tips & Edukasi',
    arahan: 'Bagikan satu pelajaran teknis singkat yang berguna bagi orang awam, berangkat dari foto ini.',
  },
}

export interface KonteksCaption {
  gaya: GayaCaption
  namaProyek?: string | null
  lokasi?: string | null
  jenis?: string | null
  /** Catatan tambahan dari pemakainya — mis. "pengecoran lantai 2 selesai". */
  catatan?: string | null
  profil?: ProfilMarcom
  /** Foto sebagai data URL; dikirim ke AI supaya kalimatnya menyebut yang terlihat. */
  fotoDataUrl?: string | null
}

export interface HasilCaption {
  teks: string
  hashtag: string[]
  /** 'ai' bila ditulis model, 'naskah' bila jatuh ke naskah bawaan. */
  sumber: 'ai' | 'naskah'
}

// ── Naskah cadangan ─────────────────────────────────────────────────────────

const NASKAH: Record<GayaCaption, (k: KonteksCaption) => string> = {
  progres: k => `Update progres ${sebutProyek(k)}.\n\n`
    + `${k.catatan?.trim() || 'Pekerjaan berjalan sesuai jadwal dan diawasi langsung di lapangan setiap hari.'}\n\n`
    + 'Setiap tahap kami dokumentasikan supaya pemilik tahu persis ke mana anggarannya berjalan.',
  selesai: k => `Alhamdulillah, ${sebutProyek(k)} selesai dan sudah diserahterimakan.\n\n`
    + `${k.catatan?.trim() || 'Terima kasih atas kepercayaan yang diberikan kepada tim kami.'}\n\n`
    + 'Rapi, tepat waktu, dan sesuai anggaran — itu yang kami jaga di setiap proyek.',
  promo: k => `Sedang merencanakan pembangunan atau renovasi${k.lokasi ? ` di ${k.lokasi}` : ''}?\n\n`
    + `${k.catatan?.trim() || 'Kami kerjakan dari perencanaan anggaran sampai serah terima, dengan laporan biaya yang terbuka.'}\n\n`
    + 'Tanpa biaya tersembunyi, progres bisa dipantau kapan saja.',
  edukasi: k => `${k.catatan?.trim() || 'Satu hal yang sering terlewat saat membangun: anggaran disusun sebelum gambar kerja matang.'}\n\n`
    + 'Akibatnya biaya membengkak di tengah jalan, dan yang dikorbankan biasanya kualitas material.\n\n'
    + `Di ${sebutProyek(k)}, setiap pekerjaan dihitung dulu, baru dikerjakan.`,
}

function sebutProyek(k: KonteksCaption): string {
  const nama = String(k.namaProyek ?? '').trim()
  const lokasi = String(k.lokasi ?? '').trim()
  if (nama && lokasi) return `${nama} — ${lokasi}`
  return nama || (lokasi ? `proyek kami di ${lokasi}` : 'proyek kami')
}

/** Hashtag bawaan: umum + lokasi, tanpa mengarang tagar yang tidak ada isinya. */
export function hashtagBawaan(k: KonteksCaption = { gaya: 'progres' }): string[] {
  const dasar = ['kontraktor', 'renovasi', 'bangunrumah', 'jasakontraktor', 'konstruksi']
  const lokasi = String(k.lokasi ?? '').trim()
  const jenis = String(k.jenis ?? '').trim()
  const perusahaan = namaTampil(k.profil ?? {})
  return bersihkanHashtag([...dasar, lokasi, jenis, perusahaan].filter(Boolean), 10)
}

/** Caption dari naskah, tanpa AI. Selalu tersedia. */
export function captionNaskah(k: KonteksCaption): HasilCaption {
  return {
    teks: (NASKAH[k.gaya] ?? NASKAH.progres)(k),
    hashtag: hashtagBawaan(k),
    sumber: 'naskah',
  }
}

// ── Caption dengan AI ───────────────────────────────────────────────────────

function bagiDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const koma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || koma < 0) return null
  return { mime: dataUrl.slice(5, dataUrl.indexOf(';')), data: dataUrl.slice(koma + 1) }
}

function prompt(k: KonteksCaption): string {
  const g = GAYA_CAPTION[k.gaya] ?? GAYA_CAPTION.progres
  return `Kamu penulis media sosial untuk perusahaan kontraktor di Indonesia.

TUGAS: tulis caption Instagram untuk foto proyek terlampir.
GAYA: ${g.label} — ${g.arahan}

DATA PROYEK
- Nama: ${k.namaProyek || '(tidak disebutkan)'}
- Lokasi: ${k.lokasi || '(tidak disebutkan)'}
- Jenis: ${k.jenis || '(tidak disebutkan)'}
- Perusahaan: ${namaTampil(k.profil ?? {}) || '(tidak disebutkan)'}
- Catatan dari tim: ${k.catatan || '(tidak ada)'}

ATURAN
- Bahasa Indonesia yang wajar, seperti orang bercerita, bukan bahasa iklan kaku.
- 3 sampai 5 kalimat, dipecah 2–3 paragraf pendek.
- Boleh 1–2 emoji, jangan lebih.
- JANGAN menulis nomor telepon, alamat, atau ajakan menghubungi — bagian itu
  ditambahkan sistem secara otomatis. Menulisnya di sini membuatnya tercetak dua kali.
- JANGAN mengarang angka, luas, durasi, atau harga yang tidak ada di data.
- JANGAN menulis hashtag di dalam teks; taruh terpisah di kolom "hashtag".

Jawab HANYA JSON:
{"teks":"...","hashtag":["kontraktor","renovasi"]}`
}

/**
 * Caption dari AI, dengan naskah sebagai jaring pengaman.
 *
 * Tidak pernah melempar: kegagalan apa pun — tanpa kunci, jaringan mati, model
 * menjawab ngawur — berakhir di naskah. Yang gagal cukup kualitas kalimatnya,
 * bukan kemampuan orangnya memposting.
 */
export async function buatCaption(k: KonteksCaption): Promise<HasilCaption> {
  const mock = (window as unknown as {
    __marcomAiMock?: (k: KonteksCaption) => Promise<HasilCaption>
  }).__marcomAiMock
  if (mock) return mock(k)

  const key = kunci()
  if (!key) return captionNaskah(k)

  try {
    const parts: Array<Record<string, unknown>> = [{ text: prompt(k) }]
    const foto = k.fotoDataUrl ? bagiDataUrl(k.fotoDataUrl) : null
    if (foto) parts.push({ inline_data: { mime_type: foto.mime, data: foto.data } })

    const res = await batasWaktu(
      panggilGemini(MODEL_TEKS[1], { contents: [{ parts }] }),
      25000,
      null,
    )
    if (!res || !res.ok) return captionNaskah(k)

    const data = await res.json()
    const teksMentah: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const json = teksMentah.slice(teksMentah.indexOf('{'), teksMentah.lastIndexOf('}') + 1)
    const isi = JSON.parse(json) as { teks?: unknown; hashtag?: unknown }

    const teks = String(isi?.teks ?? '').trim()
    if (!teks) return captionNaskah(k)

    const tag = bersihkanHashtag(isi?.hashtag, 10)
    return { teks, hashtag: tag.length ? tag : hashtagBawaan(k), sumber: 'ai' }
  } catch {
    return captionNaskah(k)
  }
}

// ── Perapian foto ───────────────────────────────────────────────────────────

export const ARAHAN_RAPIKAN = `Perbaiki HANYA kualitas fotografinya: pencahayaan, keseimbangan warna,
kontras, dan ketajaman. Langit yang pucat boleh dibuat lebih hidup.

DILARANG KERAS mengubah isi foto: jangan menambah/menghapus/memindahkan
bangunan, lantai, tiang, kendaraan, orang, atau material; jangan menyelesaikan
bagian yang masih dikerjakan; jangan mengubah bentuk, warna cat, maupun sudut
kamera. Hasilnya harus tetap foto yang sama, hanya diambil dengan pencahayaan
yang lebih baik.`

export interface HasilRapikan {
  dataUrl: string
  /** 'ai' bila benar-benar dirapikan model; 'asli' bila dipakai apa adanya. */
  sumber: 'ai' | 'asli'
  /** Alasan singkat bila jatuh ke foto asli — ditampilkan apa adanya. */
  alasan?: string
}

/**
 * Rapikan satu foto dengan model gambar.
 *
 * Kegagalan mengembalikan foto ASLI beserta alasannya, bukan melempar.
 * Pemakainya tetap bisa memposting; ia hanya perlu tahu fotonya belum dirapikan.
 */
export async function rapikanFoto(dataUrl: string): Promise<HasilRapikan> {
  const mock = (window as unknown as {
    __marcomFotoMock?: (d: string) => Promise<HasilRapikan>
  }).__marcomFotoMock
  if (mock) return mock(dataUrl)

  const key = kunci()
  if (!key) return { dataUrl, sumber: 'asli', alasan: 'Kunci AI belum dipasang.' }

  const foto = bagiDataUrl(dataUrl)
  if (!foto) return { dataUrl, sumber: 'asli', alasan: 'Format foto tidak dikenali.' }

  const body = {
    contents: [{ parts: [{ text: ARAHAN_RAPIKAN }, { inline_data: { mime_type: foto.mime, data: foto.data } }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }

  for (const model of MODEL_GAMBAR) {
    try {
      const res = await batasWaktu(
        panggilGemini(model, body),
        45000,
        null,
      )
      if (!res || !res.ok) continue
      const data = await res.json()
      const bagian = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{
        inlineData?: { data?: string }; inline_data?: { data?: string }
      }>
      const b64 = bagian.find(p => p.inlineData?.data || p.inline_data?.data)
      const isi = b64?.inlineData?.data ?? b64?.inline_data?.data
      if (isi) {
        // Satu ketukan "Rapikan foto" = satu gambar berbayar.
        catatGambar('marcom_foto', model, 1, ARAHAN_RAPIKAN)
        return { dataUrl: `data:image/png;base64,${isi}`, sumber: 'ai' }
      }
    } catch {
      // model berikutnya
    }
  }
  return { dataUrl, sumber: 'asli', alasan: 'AI tidak dapat merapikan foto ini. Foto asli dipakai.' }
}
