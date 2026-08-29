// ============================================================
// PropFS — Serah-terima alat kerja: dipinjam kapan, dibalikin kapan
//
// Modul aset yang sudah ada tahu di mana sebuah alat BERADA SEKARANG. Yang
// tidak diketahuinya adalah bagaimana ia sampai di sana, dan itulah yang
// hilang ketika alatnya tidak ketemu.
//
// Genset berpindah dari proyek A ke proyek B lewat percakapan WhatsApp yang
// tidak pernah dicatat. Dua bulan kemudian ia tidak ada di kedua proyek, dan
// pertanyaan "siapa yang terakhir memegangnya" tidak punya jawaban — hanya
// ingatan yang saling bertentangan. Alat senilai puluhan juta hilang tanpa
// satu pun catatan tentang siapa yang bertanggung jawab.
//
// Karena itu yang dicatat di sini bukan "lokasi", melainkan PERISTIWA
// SERAH-TERIMA: satu baris per peminjaman, dengan pengembaliannya menyusul di
// baris yang sama.
//
// Bentuk itu dipilih dengan sadar. Dua baris terpisah — satu "pinjam", satu
// "kembali" — tampak lebih rapi, tetapi memungkinkan keadaan yang tidak masuk
// akal: pengembalian tanpa peminjaman, atau dua pengembalian untuk satu
// peminjaman. Satu baris membuat keadaan itu MUSTAHIL, bukan sekadar dilarang.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()
const waktuMs = (v: unknown): number => {
  const t = Date.parse(teks(v))
  return Number.isFinite(t) ? t : 0
}

export type KondisiSerah = 'baik' | 'perlu_servis' | 'rusak'

export const LABEL_KONDISI_SERAH: Record<KondisiSerah, string> = {
  baik: 'Baik',
  perlu_servis: 'Perlu servis',
  rusak: 'Rusak',
}

export function kondisiSah(v: unknown): KondisiSerah {
  const k = teks(v).toLowerCase()
  return (k === 'perlu_servis' || k === 'rusak' ? k : 'baik') as KondisiSerah
}

/**
 * Satu peminjaman alat, berikut pengembaliannya bila sudah kembali.
 *
 * `kembali_at` kosong berarti alatnya MASIH DI LUAR. Itu satu-satunya
 * penentu, dan tidak ada medan "status" yang bisa berselisih dengannya.
 */
export interface Peminjaman {
  id?: string
  aset_id: string
  /** Nama alat, disalin saat dipinjam. Lihat catatan di bawah. */
  aset_nama?: string

  project_id?: string | null
  project_nama?: string

  /** Yang membawa alatnya. Orang, bukan jabatan — ini yang ditagih. */
  pemegang: string
  pemegang_hp?: string

  pinjam_at: string
  pinjam_oleh?: string
  pinjam_kondisi?: string
  pinjam_foto?: string
  pinjam_catatan?: string

  /** Kosong = belum kembali. */
  kembali_at?: string | null
  kembali_oleh?: string
  kembali_kondisi?: string
  kembali_foto?: string
  kembali_catatan?: string

  /** Janji dikembalikan. Kosong = tanpa batas waktu yang disepakati. */
  janji_kembali?: string | null

  created_at?: string
}

/** Masih di luar — belum dikembalikan. */
export function masihDipinjam(p: Peminjaman | null | undefined): boolean {
  return !!p && !teks(p.kembali_at)
}

/**
 * Peminjaman yang sedang berjalan untuk sebuah alat.
 *
 * Yang TERBARU yang dipakai bila entah bagaimana ada lebih dari satu. Keadaan
 * itu seharusnya dicegah `bolehPinjam`, tetapi dua orang yang menekan tombol
 * bersamaan di dua HP bisa melewatinya — dan ketika itu terjadi, yang paling
 * mungkin benar adalah catatan terakhir.
 */
export function pinjamanBerjalan(
  daftar: Peminjaman[] | null | undefined, asetId: unknown,
): Peminjaman | undefined {
  const id = teks(asetId)
  if (!id) return undefined
  return (daftar ?? [])
    .filter(p => teks(p.aset_id) === id && masihDipinjam(p))
    .sort((a, b) => waktuMs(b.pinjam_at) - waktuMs(a.pinjam_at))[0]
}

export interface Periksa { boleh: boolean; alasan: string }

/**
 * Apakah alat ini boleh dipinjamkan sekarang.
 *
 * Alat yang masih di tangan orang lain TIDAK boleh dipinjamkan lagi, dan
 * penolakannya menyebut nama pemegangnya. "Alat sedang dipinjam" membuat orang
 * bertanya-tanya kepada siapa; menyebut namanya membuatnya bisa langsung
 * ditelepon.
 */
export function bolehPinjam(
  daftar: Peminjaman[] | null | undefined, asetId: unknown,
): Periksa {
  const berjalan = pinjamanBerjalan(daftar, asetId)
  if (berjalan) {
    const siapa = teks(berjalan.pemegang) || 'seseorang'
    const di = teks(berjalan.project_nama)
    return {
      boleh: false,
      alasan: `Masih dipegang ${siapa}${di ? ` di ${di}` : ''}. Catat pengembaliannya dulu.`,
    }
  }
  return { boleh: true, alasan: '' }
}

/**
 * Apa yang wajib terisi sebelum peminjaman dicatat.
 *
 * Nama pemegang wajib, dan foto pun wajib. Keduanya adalah seluruh gunanya
 * catatan ini: tanda terima tanpa nama tidak menagih siapa pun, dan tanpa foto
 * tidak ada cara membuktikan alatnya diserahkan dalam keadaan apa — yang
 * justru menjadi perselisihan ketika dikembalikan lecet.
 */
export function siapPinjam(p: Partial<Peminjaman> | null | undefined): Periksa {
  if (!teks(p?.aset_id)) return { boleh: false, alasan: 'Alatnya belum dipilih.' }
  if (!teks(p?.pemegang)) {
    return { boleh: false, alasan: 'Isi nama yang membawa alatnya — ini yang ditagih kalau alatnya hilang.' }
  }
  if (!teks(p?.pinjam_at)) return { boleh: false, alasan: 'Waktu peminjaman belum terisi.' }
  if (!teks(p?.pinjam_foto)) {
    return { boleh: false, alasan: 'Ambil foto alatnya saat diserahkan — itu bukti kondisinya.' }
  }
  return { boleh: true, alasan: '' }
}

/** Apa yang wajib terisi sebelum pengembalian dicatat. */
export function siapKembali(p: Partial<Peminjaman> | null | undefined): Periksa {
  if (!teks(p?.kembali_at)) return { boleh: false, alasan: 'Waktu pengembalian belum terisi.' }
  if (!teks(p?.kembali_foto)) {
    return { boleh: false, alasan: 'Ambil foto alatnya saat dikembalikan — di situ bedanya terlihat.' }
  }
  if (waktuMs(p?.kembali_at) < waktuMs(p?.pinjam_at)) {
    return { boleh: false, alasan: 'Waktu kembali lebih awal daripada waktu pinjam. Periksa lagi.' }
  }
  return { boleh: true, alasan: '' }
}

/** Lama peminjaman dalam hari, dibulatkan ke bawah. */
export function lamaHari(p: Peminjaman | null | undefined, sekarang = Date.now()): number {
  const mulai = waktuMs(p?.pinjam_at)
  if (!mulai) return 0
  const selesai = teks(p?.kembali_at) ? waktuMs(p?.kembali_at) : sekarang
  return Math.max(0, Math.floor((selesai - mulai) / 86_400_000))
}

/**
 * Sudah lewat janji kembali.
 *
 * Hanya bila janjinya memang ada. Peminjaman tanpa janji tidak pernah
 * "terlambat" — menandainya begitu akan membuat setiap alat yang dipakai
 * berbulan-bulan di proyek panjang tampak seperti masalah.
 */
export function terlambat(p: Peminjaman | null | undefined, sekarang = Date.now()): boolean {
  if (!masihDipinjam(p)) return false
  const janji = waktuMs(p?.janji_kembali)
  return janji > 0 && sekarang > janji
}

/** Kondisi memburuk selama dipinjam — inilah yang jadi perselisihan. */
export function kondisiMemburuk(p: Peminjaman | null | undefined): boolean {
  if (!p || masihDipinjam(p)) return false
  const urut: KondisiSerah[] = ['baik', 'perlu_servis', 'rusak']
  return urut.indexOf(kondisiSah(p.kembali_kondisi)) > urut.indexOf(kondisiSah(p.pinjam_kondisi))
}

/**
 * Kalimat satu baris tentang keberadaan sebuah alat.
 *
 * Menyebut ORANG lebih dulu, baru tempat. Ketika sebuah alat dicari, yang
 * ditelepon orangnya — proyek tidak mengangkat telepon.
 */
export function keberadaanAlat(
  daftar: Peminjaman[] | null | undefined, asetId: unknown, sekarang = Date.now(),
): string {
  const p = pinjamanBerjalan(daftar, asetId)
  if (!p) return 'Di gudang'
  const siapa = teks(p.pemegang) || 'seseorang'
  const di = teks(p.project_nama)
  const hari = lamaHari(p, sekarang)
  const lama = hari === 0 ? 'hari ini' : `${hari} hari`
  return `${siapa}${di ? ` · ${di}` : ''} · ${lama}${terlambat(p, sekarang) ? ' · LEWAT JANJI' : ''}`
}

/** Riwayat sebuah alat, terbaru lebih dulu. */
export function riwayatAlat(
  daftar: Peminjaman[] | null | undefined, asetId: unknown,
): Peminjaman[] {
  const id = teks(asetId)
  if (!id) return []
  return (daftar ?? [])
    .filter(p => teks(p.aset_id) === id)
    .sort((a, b) => waktuMs(b.pinjam_at) - waktuMs(a.pinjam_at))
}

export interface RingkasLacak {
  diLuar: number
  terlambat: number
  rusakSaatKembali: number
}

/** Ringkasan untuk kepala halaman. */
export function ringkasLacak(
  daftar: Peminjaman[] | null | undefined, sekarang = Date.now(),
): RingkasLacak {
  const d = daftar ?? []
  return {
    diLuar: d.filter(masihDipinjam).length,
    terlambat: d.filter(p => terlambat(p, sekarang)).length,
    rusakSaatKembali: d.filter(kondisiMemburuk).length,
  }
}

/** Kalimat ringkasan, dengan yang paling mendesak disebut lebih dulu. */
export function kalimatLacak(r: RingkasLacak): string {
  if (!r || r.diLuar === 0) return 'Semua alat ada di gudang'
  const bagian = [`${r.diLuar} alat di luar`]
  if (r.terlambat > 0) bagian.push(`${r.terlambat} lewat janji`)
  return bagian.join(' · ')
}

/**
 * Bunyi tanda terima, siap dikirim lewat WhatsApp.
 *
 * Bukan hiasan. Seluruh serah-terima alat di lapangan sudah berlangsung di
 * WhatsApp sejak dulu — yang tidak ada hanyalah bentuk bakunya, sehingga yang
 * tersimpan di riwayat obrolan adalah "genset dibawa dulu ya pak" tanpa
 * tanggal, tanpa kondisi, tanpa nama lengkap.
 *
 * Yang dikirim TEKSNYA saja; fotonya dilampirkan pemakai dari galeri, karena
 * `wa.me` memang tidak bisa membawa gambar. Justru karena itu tanggal & jam
 * dibakar ke dalam fotonya: begitu ia berpindah ke WhatsApp, teks ini dan
 * gambarnya berjalan sendiri-sendiri, dan hanya yang tercetak di gambar yang
 * pasti ikut.
 */
export function pesanTandaTerima(p: Peminjaman | null | undefined): string {
  if (!p) return ''
  const tgl = (v: unknown): string => {
    const t = Date.parse(teks(v))
    if (!Number.isFinite(t)) return '-'
    const d = new Date(t)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${
      String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const baris = [
    masihDipinjam(p) ? '*TANDA TERIMA ALAT*' : '*TANDA TERIMA ALAT — SUDAH KEMBALI*',
    `Alat: ${teks(p.aset_nama) || '-'}`,
    `Dipegang: ${teks(p.pemegang) || '-'}`,
  ]
  if (teks(p.project_nama)) baris.push(`Lokasi: ${teks(p.project_nama)}`)
  baris.push(`Dipinjam: ${tgl(p.pinjam_at)} · kondisi ${LABEL_KONDISI_SERAH[kondisiSah(p.pinjam_kondisi)].toLowerCase()}`)

  if (masihDipinjam(p)) {
    // Janji kembali disebut hanya bila ada. Menuliskan "Janji kembali: -"
    // membuat setiap tanda terima tampak seperti formulir yang belum selesai.
    if (teks(p.janji_kembali)) baris.push(`Janji kembali: ${tgl(p.janji_kembali)}`)
  } else {
    baris.push(`Dikembalikan: ${tgl(p.kembali_at)} · kondisi ${LABEL_KONDISI_SERAH[kondisiSah(p.kembali_kondisi)].toLowerCase()}`)
    if (kondisiMemburuk(p)) baris.push('CATATAN: kondisi alat menurun selama dipinjam.')
  }
  const catatan = teks(masihDipinjam(p) ? p.pinjam_catatan : p.kembali_catatan)
  if (catatan) baris.push(`Catatan: ${catatan}`)
  return baris.join('\n')
}
