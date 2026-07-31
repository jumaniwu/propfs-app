// ============================================================
// PropFS — Prompt bebas untuk render 3D dari layout
//
// Render 3D sebelumnya hanya bisa dijalankan lewat kuesioner tetap dan daftar
// gaya yang sudah ditentukan. Padahal yang ingin disampaikan orang biasanya
// kalimat biasa: "coba yang tropis, tampak depan, sore hari". Modul ini
// menerjemahkan kalimat itu menjadi instruksi render — sekaligus MENJAGA
// aturan yang tidak boleh ditawar: layoutnya adalah kebenaran, prompt hanya
// mengubah rupa, bukan tata letak.
//
// Bagian yang berbahaya justru di situ. Model gambar sangat mudah "berkreasi"
// mengubah bentuk lahan dan memindahkan blok bila diminta bebas. Karena itu
// batasannya ditulis ulang di setiap prompt, bukan sekali di awal percakapan.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export type SudutRender = 'depan' | 'sudut' | 'atas' | 'mata_manusia' | 'interior'

export const LABEL_SUDUT: Record<SudutRender, string> = {
  depan: 'Tampak Depan',
  sudut: 'Perspektif Sudut',
  atas: 'Mata Burung (Drone)',
  mata_manusia: 'Setinggi Mata Orang',
  interior: 'Interior',
}

const ARAH_KAMERA: Record<SudutRender, string> = {
  depan: 'Kamera lurus menghadap muka bangunan/kawasan, setinggi 1,6 m, lensa 35 mm. Seluruh muka terlihat utuh tanpa terpotong.',
  sudut: 'Kamera tiga-perempat pada sudut kawasan, setinggi ±5 m, lensa 24 mm — memperlihatkan dua sisi bangunan sekaligus.',
  atas: 'Kamera drone ±60 m di atas kawasan, menunduk ±45°, memperlihatkan seluruh tata letak dari udara.',
  mata_manusia: 'Kamera setinggi mata orang berdiri di jalan dalam kawasan, lensa 35 mm — kesan seperti orang yang sedang berjalan di sana.',
  interior: 'Kamera di DALAM bangunan utama, lensa 24 mm, memperlihatkan ruang beserta bukaan ke luar.',
}

/**
 * Kata yang menandai sudut kamera. Diperiksa dari yang PALING KHUSUS supaya
 * "dari dalam ruangan" tidak keburu tertangkap oleh "dalam".
 */
const PETUNJUK_SUDUT: Array<[SudutRender, RegExp]> = [
  ['interior', /\b(interior|dalam ruang|dalam ruangan|di dalam|ruang tamu|indoor)\b/],
  ['atas', /\b(atas|drone|udara|mata burung|birds?[- ]?eye|aerial|siteplan 3d)\b/],
  ['mata_manusia', /\b(mata orang|setinggi mata|eye ?level|dari jalan|pejalan|street ?view)\b/],
  ['depan', /\b(depan|muka|fasad|facade|tampak depan|front)\b/],
  ['sudut', /\b(sudut|perspektif|tiga perempat|3\/4|angle)\b/],
]

/** Baca sudut kamera dari kalimat bebas. null = tidak disebut. */
export function bacaSudut(pesan: string): SudutRender | null {
  const t = (pesan ?? '').toLowerCase()
  for (const [sudut, pola] of PETUNJUK_SUDUT) if (pola.test(t)) return sudut
  return null
}

/** Waktu pengambilan gambar, karena ini paling sering diminta orang. */
export function bacaWaktu(pesan: string): string | null {
  const t = (pesan ?? '').toLowerCase()
  if (/\b(malam|night|gelap)\b/.test(t)) return 'malam hari dengan pencahayaan buatan yang hangat'
  if (/\b(sore|senja|golden hour|sunset)\b/.test(t)) return 'sore hari saat golden hour, bayangan panjang dan hangat'
  if (/\b(pagi|subuh|sunrise)\b/.test(t)) return 'pagi hari dengan cahaya lembut'
  if (/\b(mendung|hujan|overcast)\b/.test(t)) return 'langit mendung dengan cahaya merata'
  return null
}

export interface KonteksRender {
  /** Ringkasan layout dari engine siteplan / analisis CAD. */
  deskripsiLayout?: string
  /** Nama proyek, untuk menjaga konsistensi antar render. */
  proyek?: string
  /** true bila ada render sebelumnya yang dilampirkan sebagai acuan desain. */
  adaAcuan?: boolean
  /** Percakapan sebelumnya, supaya "yang tadi tapi malam hari" bisa dimengerti. */
  riwayat?: string[]
}

/**
 * Susun instruksi render dari kalimat bebas pemakainya.
 *
 * Aturan tata letak ditulis ulang UTUH di setiap prompt. Menaruhnya sekali di
 * awal percakapan tidak cukup: tiap panggilan gambar berdiri sendiri, dan
 * model akan mengarang bentuk lahan baru begitu batasannya tidak terlihat.
 */
export function susunPromptRender(pesan: string, konteks: KonteksRender = {}): string {
  const sudut = bacaSudut(pesan) ?? 'sudut'
  const waktu = bacaWaktu(pesan)
  const riwayat = (konteks.riwayat ?? []).filter(Boolean).slice(-4)

  const bagian: string[] = [
    'Anda adalah visualisator arsitektur profesional.',
    'LAMPIRAN 1 adalah DENAH / LAYOUT FINAL proyek ini — inilah GROUND TRUTH tata letak.',
  ]
  if (konteks.adaAcuan) {
    bagian.push('LAMPIRAN 2 adalah RENDER RESMI proyek YANG SAMA dari sudut lain — GROUND TRUTH desain bangunan.')
  }

  bagian.push(`
TUGAS: bayangkan layout ini diekstrusi ke 3D lalu difoto — hasilkan SATU render FOTOREALISTIS dari hasil ekstrusi itu, BUKAN kawasan baru yang sekadar mirip.

ATURAN MUTLAK (pelanggaran = gagal):
1. BENTUK BATAS LAHAN identik dengan layout. Lahan segitiga tetap segitiga.
2. Jumlah, posisi, orientasi, dan proporsi SETIAP blok bangunan sama persis — dilarang menambah, mengurangi, atau memindahkan.
3. Jaringan jalan, parkir, dan area hijau tetap di posisinya.
4. Permintaan pemakai di bawah HANYA boleh mengubah RUPA — gaya, material, warna, lanskap, cuaca, sudut kamera. Bila permintaannya menyiratkan perubahan tata letak (menambah lantai/blok, menggeser bangunan), ABAIKAN bagian itu dan tetap ikuti layout.${konteks.adaAcuan ? `
5. KONSISTENSI: desain, jumlah lantai, material, dan warna HARUS SAMA dengan LAMPIRAN 2 — proyek yang sama, hanya sudutnya berbeda.` : ''}`)

  if (konteks.deskripsiLayout?.trim()) {
    bagian.push(`\nLAYOUT MENURUT ANALISIS:\n${konteks.deskripsiLayout.trim()}`)
  }
  if (riwayat.length > 0) {
    bagian.push(`\nPERMINTAAN SEBELUMNYA (untuk memahami rujukan seperti "yang tadi"):\n${riwayat.map(r => `- ${r}`).join('\n')}`)
  }

  bagian.push(`\nPERMINTAAN PEMAKAI:\n${(pesan ?? '').trim() || 'Render kawasan ini apa adanya, gaya modern minimalis.'}`)
  bagian.push(`\nSUDUT PANDANG (${LABEL_SUDUT[sudut]}):\n${ARAH_KAMERA[sudut]}`)
  if (waktu) bagian.push(`\nWAKTU & CAHAYA: ${waktu}.`)
  bagian.push('\nFotorealistis kualitas presentasi developer properti, rasio 16:9 landscape. Tanpa teks, watermark, atau logo apa pun di dalam gambar.')

  return bagian.join('\n')
}

/** Judul singkat untuk kartu hasil render, diambil dari permintaannya. */
export function judulRender(pesan: string): string {
  const bersih = (pesan ?? '').trim().replace(/\s+/g, ' ')
  const sudut = bacaSudut(bersih)
  const dasar = bersih.length > 0 ? bersih : 'Render kawasan'
  const potong = dasar.length > 48 ? dasar.slice(0, 47).trimEnd() + '…' : dasar
  return sudut ? `${potong} · ${LABEL_SUDUT[sudut]}` : potong
}
