// ============================================================
// PropFS — Pekerja lapangan yang terdaftar, dan upah mingguannya
//
// CACAT YANG DIPERBAIKI BERKAS INI.
//
// Absensi harian meminta nama pekerja DIKETIK setiap hari. Di lapangan itu
// berarti mandor mengetik lima belas nama tiap sore, dari HP. Yang terjadi
// berikutnya sudah bisa ditebak — "Yono", "yono", "Pak Yono", "Yon" — dan
// rekap upahnya memecah satu orang menjadi empat.
//
// Penggabungan nama sudah dijaga (kunciPekerja di absensiPekerja.ts), tetapi
// itu menambal AKIBAT. Sebabnya: pekerja tidak pernah punya wujud. Ia hanya
// teks yang lahir dan mati bersama satu baris laporan — jadi ia tidak bisa
// punya peran tetap, tidak bisa punya upah harian, dan tidak bisa dikenali
// lewat foto.
//
// Sekarang pekerja didaftarkan sekali di awal, dan absensi harian tinggal
// mengetuk. Mengetik nama berhenti menjadi pekerjaan harian.
//
// UPAH: HARIAN vs BORONGAN.
//
// Pekerja harian dibayar per hari kerja — rekap mingguan bisa menghitungnya.
// Pekerja borongan dibayar per pekerjaan yang selesai, bukan per hari; berapa
// hari ia datang tidak menentukan berapa ia dibayar. Untuk mereka kolom
// upahnya DIKOSONGKAN, bukan diisi nol.
//
// Nol dan kosong bukan hal yang sama. Nol berkata "orang ini bekerja dan
// tidak dibayar sepeser pun"; kosong berkata "orang ini tidak dibayar dengan
// cara ini". Yang pertama akan ditanyakan orang di akhir minggu, dan tidak
// ada yang bisa menjawabnya.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

import { hokStatus, kunciPekerja, rapikanNama, type BarisAbsensi } from './absensiPekerja.ts'

export type JenisUpah = 'harian' | 'borongan'

export const JENIS_UPAH: Array<{ key: JenisUpah; label: string; untuk: string }> = [
  {
    key: 'harian',
    label: 'Harian',
    untuk: 'Dibayar per hari kerja — upahnya dihitung di rekap mingguan.',
  },
  {
    key: 'borongan',
    label: 'Borongan',
    untuk: 'Dibayar per pekerjaan selesai. Absensinya tetap dicatat, upahnya tidak dihitung di sini.',
  },
]

export interface PekerjaLapangan {
  id: string
  nama: string
  peran: string
  no_hp: string
  jenis: JenisUpah
  /** Hanya berarti untuk 'harian'. Pada borongan nilainya diabaikan. */
  upah_harian: number
  /** Foto wajah, sudah dikecilkan. Untuk mengenali nama di daftar absen. */
  foto: string
  aktif: boolean
}

export const PEKERJA_KOSONG: Omit<PekerjaLapangan, 'id'> = {
  nama: '', peran: '', no_hp: '', jenis: 'harian', upah_harian: 0, foto: '', aktif: true,
}

function angka(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

/** Jenis upah dengan bawaan yang aman untuk baris lama. */
export function jenisUpah(p: { jenis?: unknown } | null | undefined): JenisUpah {
  return String(p?.jenis ?? '').trim().toLowerCase() === 'borongan' ? 'borongan' : 'harian'
}

/** Baca seorang pekerja dari jawaban server apa adanya. */
export function bacaPekerja(mentah: unknown): PekerjaLapangan | null {
  if (!mentah || typeof mentah !== 'object') return null
  const o = mentah as Record<string, unknown>
  const nama = rapikanNama(o.nama)
  if (nama.length < 2) return null
  return {
    id: String(o.id ?? ''),
    nama,
    peran: rapikanNama(o.peran),
    no_hp: String(o.no_hp ?? '').trim(),
    jenis: jenisUpah(o),
    upah_harian: Math.max(0, angka(o.upah_harian)),
    foto: typeof o.foto === 'string' ? o.foto : '',
    aktif: o.aktif !== false,
  }
}

/** Daftar pekerja dari jawaban server; yang rusak dilewati diam-diam. */
export function bacaDaftarPekerja(mentah: unknown): PekerjaLapangan[] {
  if (!Array.isArray(mentah)) return []
  const out: PekerjaLapangan[] = []
  for (const x of mentah) {
    const p = bacaPekerja(x)
    if (p) out.push(p)
  }
  return out.sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
}

export interface PeriksaPekerja {
  boleh: boolean
  alasan: string
}

/**
 * Apakah seorang pekerja layak didaftarkan.
 *
 * Upah harian BOLEH nol walau jenisnya harian: upahnya sering baru disepakati
 * beberapa hari kemudian, sementara orangnya sudah mulai bekerja hari ini.
 * Menolak pendaftarannya karena itu berarti absensinya hilang justru pada
 * hari-hari yang paling mudah dilupakan.
 */
export function siapDaftarPekerja(
  p: Partial<PekerjaLapangan>,
  sudahAda: Array<{ id?: string; nama: string }> = [],
): PeriksaPekerja {
  const nama = rapikanNama(p?.nama)
  if (nama.length < 2) {
    return { boleh: false, alasan: 'Isi nama pekerjanya — minimal dua huruf.' }
  }

  const kunci = kunciPekerja(nama)
  const kembar = sudahAda.find(x => kunciPekerja(x.nama) === kunci && x.id !== p.id)
  if (kembar) {
    return { boleh: false, alasan: `"${kembar.nama}" sudah terdaftar di proyek ini.` }
  }

  const upah = angka(p?.upah_harian)
  if (upah < 0) return { boleh: false, alasan: 'Upah harian tidak boleh minus.' }
  // Batas atas yang longgar, semata untuk menangkap salah ketik nol berlebih —
  // upah harian tukang tidak pernah menyentuh sepuluh juta sehari.
  if (upah > 10_000_000) {
    return { boleh: false, alasan: 'Upah harian tampak kelebihan angka nol — periksa lagi.' }
  }
  return { boleh: true, alasan: '' }
}

/** Baris absensi awal untuk seorang pekerja terdaftar: hadir, tanpa foto. */
export function barisDariPekerja(p: PekerjaLapangan): BarisAbsensi {
  return {
    pekerja_id: p.id,
    nama: p.nama,
    peran: p.peran || undefined,
    status: 'hadir',
  }
}

/** Pekerja yang BELUM ada di daftar absen hari ini. */
export function belumDiabsen(
  daftar: PekerjaLapangan[] | null | undefined,
  baris: BarisAbsensi[] | null | undefined,
): PekerjaLapangan[] {
  const dipakai = new Set((baris ?? []).map(b => b.pekerja_id || kunciPekerja(b.nama)))
  return (daftar ?? []).filter(p => p.aktif && !dipakai.has(p.id) && !dipakai.has(kunciPekerja(p.nama)))
}

// ── Rekap mingguan untuk pembayaran upah ───────────────────────────────────

/**
 * Hari pertama minggu, Senin.
 *
 * Dipilih Senin karena itulah yang dipakai kalender dan karena rentangnya
 * SELALU ditampilkan apa adanya di layar ("Sen 10 – Min 16 Agu"). Perusahaan
 * yang membayar tiap Sabtu tetap bisa membacanya tanpa salah paham, karena
 * yang dilihatnya tanggal, bukan nama minggu.
 */
export function awalMinggu(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(tanggal ?? '').trim())
  if (!m) return ''
  // Dibaca sebagai UTC supaya tidak bergeser sehari di zona waktu mana pun —
  // pergeseran satu hari memindahkan upah Senin ke minggu sebelumnya.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return ''
  const hari = d.getUTCDay()            // 0 Minggu … 6 Sabtu
  const mundur = hari === 0 ? 6 : hari - 1
  d.setUTCDate(d.getUTCDate() - mundur)
  return d.toISOString().slice(0, 10)
}

/** Hari terakhir minggu (Minggu) dari hari pertamanya. */
export function akhirMinggu(awal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(awal ?? '').trim())
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

const NAMA_BULAN_PENDEK = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/** "10 – 16 Agu 2026". Rentangnya ditulis apa adanya, bukan "Minggu ke-3". */
export function labelMinggu(awal: string): string {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(awal ?? '').trim())
  if (!a) return 'Tanpa tanggal'
  const akhir = akhirMinggu(awal)
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(akhir)
  if (!b) return awal

  const blnA = NAMA_BULAN_PENDEK[Number(a[2]) - 1] ?? a[2]
  const blnB = NAMA_BULAN_PENDEK[Number(b[2]) - 1] ?? b[2]
  const hariA = String(Number(a[3]))
  const hariB = String(Number(b[3]))

  if (a[1] === b[1] && a[2] === b[2]) return `${hariA} – ${hariB} ${blnB} ${b[1]}`
  if (a[1] === b[1]) return `${hariA} ${blnA} – ${hariB} ${blnB} ${b[1]}`
  return `${hariA} ${blnA} ${a[1]} – ${hariB} ${blnB} ${b[1]}`
}

export interface UpahPekerja {
  kunci: string
  pekerja_id: string
  nama: string
  peran: string
  jenis: JenisUpah
  hadir: number
  setengah: number
  izin: number
  alpa: number
  hok: number
  jamLembur: number
  /** Upah harian yang berlaku; 0 bila belum disepakati. */
  upahHarian: number
  /**
   * Upah minggu ini. `null` untuk borongan — dan null BUKAN nol.
   * Nol berarti "bekerja tanpa dibayar"; null berarti "tidak dibayar begini".
   */
  upah: number | null
  tanggal: string[]
}

export interface MingguUpah {
  awal: string
  akhir: string
  label: string
  baris: UpahPekerja[]
  /** Jumlah upah yang bisa dihitung. Borongan tidak ikut. */
  totalUpah: number
  totalHok: number
  /** Berapa orang borongan di minggu ini — supaya nol di kolom upah punya penjelasan. */
  jumlahBorongan: number
}

/** Laporan seminimal yang dibutuhkan rekap. */
export interface LaporanAbsensi {
  tanggal: string
  absensi?: BarisAbsensi[] | null
}

/**
 * Rekap upah per minggu, siap dipakai membayar.
 *
 * Satu orang, satu tanggal, satu hitungan — sama seperti rekapAbsensi(). Dua
 * mandor yang melapor di hari yang sama tidak boleh membuat seseorang dibayar
 * dua kali.
 *
 * Upah harian diambil dari daftar pekerja SAAT INI, bukan dari absensinya.
 * Konsekuensinya jujur dan harus disebut: menaikkan upah seseorang mengubah
 * juga hitungan minggu-minggu yang sudah lewat. Itu pilihan yang disengaja —
 * menyimpan tarif ke dalam tiap baris absensi berarti tarif yang salah ketik
 * di hari pertama akan menghantui selamanya, dan memperbaikinya berarti
 * menyunting tiga puluh baris satu per satu.
 */
export function rekapUpahMingguan(
  laporan: LaporanAbsensi[] | null | undefined,
  pekerja: PekerjaLapangan[] | null | undefined,
): MingguUpah[] {
  const tarif = new Map<string, PekerjaLapangan>()
  for (const p of pekerja ?? []) {
    tarif.set(p.id, p)
    tarif.set(kunciPekerja(p.nama), p)
  }

  const minggu = new Map<string, Map<string, UpahPekerja>>()
  const sudah = new Set<string>()      // `${kunci}@${tanggal}`

  for (const lap of laporan ?? []) {
    const tgl = String(lap?.tanggal ?? '').slice(0, 10)
    const awal = awalMinggu(tgl)
    if (!awal) continue

    for (const b of lap?.absensi ?? []) {
      const nama = rapikanNama(b?.nama)
      if (!nama) continue
      const kunci = b?.pekerja_id || kunciPekerja(nama)
      if (!kunci) continue

      const cap = `${kunci}@${tgl}`
      if (sudah.has(cap)) continue
      sudah.add(cap)

      let isi = minggu.get(awal)
      if (!isi) { isi = new Map(); minggu.set(awal, isi) }

      const asal = tarif.get(kunci) ?? tarif.get(kunciPekerja(nama)) ?? null
      let r = isi.get(kunci)
      if (!r) {
        r = {
          kunci,
          pekerja_id: b?.pekerja_id ?? '',
          nama: asal?.nama || nama,
          peran: asal?.peran || b?.peran || '',
          jenis: asal ? asal.jenis : 'harian',
          hadir: 0, setengah: 0, izin: 0, alpa: 0,
          hok: 0, jamLembur: 0,
          upahHarian: asal?.upah_harian ?? 0,
          upah: 0,
          tanggal: [],
        }
        isi.set(kunci, r)
      }

      const status = b?.status ?? 'hadir'
      if (status === 'hadir' || status === 'setengah' || status === 'izin' || status === 'alpa') {
        r[status] += 1
      }
      r.hok += hokStatus(status)
      r.jamLembur += angka(b?.lembur)
      if (tgl) r.tanggal.push(tgl)
    }
  }

  const hasil: MingguUpah[] = []
  for (const [awal, isi] of minggu) {
    const baris = [...isi.values()]
    for (const r of baris) {
      r.tanggal.sort((a, b) => b.localeCompare(a))
      // Di sinilah keputusan borongan diambil, dan hanya di sini.
      r.upah = r.jenis === 'borongan' ? null : Math.round(r.hok * r.upahHarian)
    }
    baris.sort((a, b) => (b.upah ?? -1) - (a.upah ?? -1) || a.nama.localeCompare(b.nama, 'id-ID'))

    hasil.push({
      awal,
      akhir: akhirMinggu(awal),
      label: labelMinggu(awal),
      baris,
      totalUpah: baris.reduce((s, r) => s + (r.upah ?? 0), 0),
      totalHok: baris.reduce((s, r) => s + r.hok, 0),
      jumlahBorongan: baris.filter(r => r.jenis === 'borongan').length,
    })
  }

  // Minggu terbaru lebih dulu — upah yang belum dibayar selalu yang terakhir.
  return hasil.sort((a, b) => b.awal.localeCompare(a.awal))
}

/**
 * Pekerja harian yang upahnya belum diisi, padahal minggu ini ia bekerja.
 *
 * Bukan galat — upah sering baru disepakati beberapa hari setelah orangnya
 * mulai. Tetapi pada saat membayar, angka nol yang diam jauh lebih berbahaya
 * daripada peringatan yang berisik: yang dibayar akan kurang, dan yang
 * membayar tidak akan tahu.
 */
export function upahBelumDiisi(minggu: MingguUpah | null | undefined): UpahPekerja[] {
  return (minggu?.baris ?? []).filter(
    r => r.jenis === 'harian' && r.hok > 0 && r.upahHarian <= 0,
  )
}
