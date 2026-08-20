// ============================================================
// PropFS — Gambar Kerja & Denah
//
// Gambar kerja beredar lewat WhatsApp. Akibatnya bukan sekadar berantakan:
// tukang membuka gambar yang salah karena ia yang paling mudah ditemukan di
// gulungan chat, dan yang dibangun mengikuti revisi yang sudah dicabut.
// Kesalahannya baru ketahuan setelah dicor.
//
// Jadi yang diurus modul ini bukan "menyimpan berkas" — itu bagian mudahnya —
// melainkan MANA YANG TERBARU, dan bagaimana membuat jawabannya tidak bisa
// disalahpahami di layar HP setinggi lima senti di bawah terik matahari.
//
// Tiga keputusan yang menentukan:
//
//   1. REVISI MENAMBAH VERSI, TIDAK MENGGANTI. Gambar lama tidak dihapus; ia
//      satu-satunya cara menjelaskan kenapa yang terlanjur dibangun berbentuk
//      begitu.
//   2. VERSI DIKELOMPOKKAN MENURUT NAMA. "Denah Lantai 1" v1, v2, v3 adalah
//      satu gambar dengan tiga versi, bukan tiga gambar.
//   3. YANG LAMA DITANDAI, bukan disembunyikan. Menyembunyikannya membuat
//      orang mencari-cari; menandainya membuat orang berhenti.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()

export type KategoriGambar = 'arsitektur' | 'struktur' | 'mep' | 'lain'

export const KATEGORI: Array<{ key: KategoriGambar; label: string; untuk: string }> = [
  { key: 'arsitektur', label: 'Arsitektur', untuk: 'Denah, tampak, potongan, detail finishing' },
  { key: 'struktur', label: 'Struktur', untuk: 'Pondasi, kolom, balok, pembesian' },
  { key: 'mep', label: 'MEP', untuk: 'Listrik, air bersih & kotor, AC' },
  { key: 'lain', label: 'Lain-lain', untuk: 'Site plan, izin, gambar pendukung' },
]

export const LABEL_KATEGORI: Record<KategoriGambar, string> =
  Object.fromEntries(KATEGORI.map(k => [k.key, k.label])) as Record<KategoriGambar, string>

export function kategoriSah(v: unknown): KategoriGambar {
  const k = teks(v).toLowerCase()
  return (KATEGORI.some(x => x.key === k) ? k : 'lain') as KategoriGambar
}

/**
 * Jenis berkas yang diterima.
 *
 * DWG dan DXF ikut walaupun tidak bisa ditampilkan di peramban — dan itu
 * disengaja. Yang membukanya di kantor punya AutoCAD, dan menolak berkas asli
 * hanya akan membuat orang menyimpannya di tempat lain, yang justru masalah
 * yang sedang diselesaikan.
 */
export const TIPE_DITERIMA = ['pdf', 'dwg', 'dxf', 'png', 'jpg', 'jpeg', 'webp'] as const

/** Bisa ditampilkan langsung di dalam aplikasi, tanpa aplikasi lain. */
export const BISA_DILIHAT = ['pdf', 'png', 'jpg', 'jpeg', 'webp']

export function akhiran(nama: unknown): string {
  const m = /\.([a-z0-9]+)$/i.exec(teks(nama))
  return m ? m[1].toLowerCase() : ''
}

export function tipeDiterima(nama: unknown): boolean {
  return (TIPE_DITERIMA as readonly string[]).includes(akhiran(nama))
}

export function bisaDilihatLangsung(nama: unknown): boolean {
  return BISA_DILIHAT.includes(akhiran(nama))
}

/** 50 MB — sama dengan batas bucket-nya, supaya penolakannya terjadi di layar
 *  sebelum unggahannya berjalan sepuluh menit lalu ditolak server. */
export const BATAS_UKURAN = 52_428_800

export function ukuranTerbaca(bytes: unknown): string {
  const b = Number(bytes) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Kunci pengelompokan versi.
 *
 * Longgar dengan sengaja: "Denah Lantai 1", "denah lantai 1", dan "Denah
 * Lantai  1" adalah gambar yang sama diketik tiga orang berbeda. Kalau
 * ketiganya dianggap gambar terpisah, tidak satu pun dari mereka punya
 * riwayat versi — dan yang tersisa hanyalah tiga berkas tanpa hubungan, persis
 * keadaan di WhatsApp yang hendak ditinggalkan.
 */
export function kunciGambar(nama: unknown): string {
  return teks(nama).toLowerCase().replace(/\s+/g, ' ')
}

export interface BarisGambar {
  id?: string
  nama: string
  kategori?: string
  versi?: number
  path?: string
  berkas_nama?: string
  mime?: string
  ukuran?: number
  catatan?: string
  perubahan?: string
  diunggah_oleh?: string
  created_at?: string
  project_name?: string
}

/** Versi berikutnya untuk sebuah nama. Selalu satu di atas yang tertinggi. */
export function versiBerikut(daftar: BarisGambar[], nama: unknown): number {
  const kunci = kunciGambar(nama)
  if (!kunci) return 1
  const tertinggi = (daftar ?? [])
    .filter(b => kunciGambar(b?.nama) === kunci)
    .reduce((t, b) => Math.max(t, Number(b?.versi) || 0), 0)
  return tertinggi + 1
}

export interface KelompokGambar {
  kunci: string
  /** Nama sebagaimana ditulis pada versi TERBARU — ejaan terakhir yang menang. */
  nama: string
  kategori: KategoriGambar
  terbaru: BarisGambar
  /** Versi lama, terbaru lebih dulu. Kosong bila baru ada satu versi. */
  riwayat: BarisGambar[]
}

/**
 * Kelompokkan baris menjadi satu entri per gambar.
 *
 * Diurutkan menurut versi, BUKAN menurut created_at. Bedanya terasa ketika
 * seseorang mengunggah revisi lama yang tertinggal: waktunya paling baru,
 * tetapi versinya bukan yang berlaku. Mengurutkan menurut waktu akan
 * menobatkannya sebagai "terbaru" — dan itu persis kesalahan yang dicegah
 * seluruh modul ini.
 */
export function kelompokkanGambar(daftar: BarisGambar[]): KelompokGambar[] {
  const peta = new Map<string, BarisGambar[]>()
  for (const b of daftar ?? []) {
    const kunci = kunciGambar(b?.nama)
    if (!kunci) continue
    const isi = peta.get(kunci)
    if (isi) isi.push(b)
    else peta.set(kunci, [b])
  }

  const hasil: KelompokGambar[] = []
  for (const [kunci, isi] of peta) {
    const urut = [...isi].sort((a, b) => (Number(b.versi) || 0) - (Number(a.versi) || 0))
    const terbaru = urut[0]
    hasil.push({
      kunci,
      nama: teks(terbaru.nama),
      kategori: kategoriSah(terbaru.kategori),
      terbaru,
      riwayat: urut.slice(1),
    })
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

/**
 * Potongan nama yang aman dipakai sebagai jalur berkas di Storage.
 *
 * Nama gambar diketik orang dan kerap memuat garis miring ("Denah Lt.1/2"),
 * tanda kurung, dan huruf beraksen. Garis miring di dalam jalur Storage
 * MEMBUAT FOLDER BARU — dan folder pertama itulah yang dipakai memeriksa hak
 * akses, sehingga nama yang keliru bukan sekadar berantakan melainkan bisa
 * membuat berkasnya tidak bisa dibuka siapa pun.
 */
export function potonganAman(v: unknown, cadangan = 'gambar'): string {
  const s = teks(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
  return s || cadangan
}

/**
 * Jalur berkas di Storage.
 *
 * Potongan PERTAMA wajib id pemilik workspace: aturan akses bucket memeriksa
 * tepat potongan itu, jadi bentuk jalurnya bukan selera penamaan melainkan
 * bagian dari pengamanannya.
 */
export function jalurBerkas(p: {
  ownerId: string
  proyek?: string
  nama: string
  versi: number
  berkasNama: string
}): string {
  const versi = Math.max(1, Math.floor(Number(p?.versi) || 1))
  const ext = akhiran(p?.berkasNama)
  return [
    teks(p?.ownerId) || 'tanpa-pemilik',
    potonganAman(p?.proyek, 'tanpa-proyek'),
    potonganAman(p?.nama),
    `v${versi}-${Date.now()}${ext ? `.${ext}` : ''}`,
  ].join('/')
}

export interface PeriksaUnggah {
  boleh: boolean
  alasan: string
}

/** Apakah sebuah unggahan layak dikirim — diperiksa SEBELUM berkasnya jalan. */
export function siapUnggah(p: {
  nama?: unknown
  berkasNama?: unknown
  ukuran?: unknown
}): PeriksaUnggah {
  if (!teks(p?.nama)) {
    return { boleh: false, alasan: 'Beri nama gambarnya, mis. "Denah Lantai 1".' }
  }
  if (!teks(p?.berkasNama)) {
    return { boleh: false, alasan: 'Pilih berkasnya dulu.' }
  }
  if (!tipeDiterima(p?.berkasNama)) {
    return {
      boleh: false,
      alasan: `Jenis berkas ${akhiran(p?.berkasNama) || 'itu'} belum didukung. Pakai ${TIPE_DITERIMA.join(', ')}.`,
    }
  }
  const ukuran = Number(p?.ukuran) || 0
  if (ukuran > BATAS_UKURAN) {
    return {
      boleh: false,
      alasan: `Berkasnya ${ukuranTerbaca(ukuran)} — batasnya ${ukuranTerbaca(BATAS_UKURAN)}. Kirim per lembar, jangan satu berkas untuk semua gambar.`,
    }
  }
  return { boleh: true, alasan: '' }
}

/**
 * Kalimat yang menandai sebuah versi, untuk dibaca sekilas di lapangan.
 *
 * "Versi 3 — BERLAKU" dan "Versi 2 — sudah diganti". Kata "berlaku" dipilih
 * alih-alih "terbaru": yang dicari tukang bukan yang paling baru diunggah,
 * melainkan yang boleh dikerjakan.
 */
export function tandaVersi(versi: unknown, berlaku: boolean): string {
  const v = Math.max(1, Math.floor(Number(versi) || 1))
  return berlaku ? `Versi ${v} — BERLAKU` : `Versi ${v} — sudah diganti`
}

/** Ringkasan satu proyek: berapa gambar, berapa yang pernah direvisi. */
export function ringkasGambar(kelompok: KelompokGambar[]): string {
  const n = kelompok?.length ?? 0
  if (n === 0) return 'Belum ada gambar kerja'
  const direvisi = kelompok.filter(k => k.riwayat.length > 0).length
  const dasar = `${n} gambar`
  return direvisi > 0 ? `${dasar} · ${direvisi} pernah direvisi` : dasar
}
