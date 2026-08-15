// ============================================================
// PropFS — Absensi pekerja, menyatu dengan laporan harian
//
// KENAPA MENYATU, BUKAN MODUL SENDIRI.
//
// Mandor sudah mengisi laporan harian tiap sore: kegiatan apa, catatan,
// foto. Kalau absensi jadi halaman terpisah, ia harus membuka link kedua
// dan menulis tanggal serta namanya sendiri untuk kedua kalinya. Yang
// terjadi berikutnya bisa ditebak: absensinya diisi seminggu sekali dari
// ingatan, dan angkanya berhenti berarti.
//
// Jadi absensi adalah satu blok DI DALAM laporan harian. Satu tanggal, satu
// pengiriman, satu ketukan kirim.
//
// APA YANG DIHITUNG, DAN APA YANG SENGAJA TIDAK.
//
// Yang dihitung: HOK — hari orang kerja. Hadir sehari penuh = 1, setengah
// hari = 0,5. Itu satuan yang dipakai kontraktor di lapangan, dan satu-
// satunya angka yang bisa diturunkan dari kehadiran tanpa mengarang apa pun.
//
// Yang TIDAK dihitung: upah. Jam lembur disimpan terpisah dari HOK dan tidak
// pernah dilebur ke dalamnya — mengubah 2 jam lembur menjadi "0,25 HOK"
// berarti memutuskan bahwa lembur dibayar setara jam biasa, dan itu keputusan
// pemilik usaha, bukan keputusan sebuah fungsi. Tarif harian juga tidak
// pernah masuk ke sini: halaman absensi dibuka tanpa login oleh siapa pun
// yang memegang linknya, dan upah tiap tukang bukan miliknya untuk dilihat.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

/** Sehari kerja penuh, dipakai hanya untuk menerangkan lembur ke pemakainya. */
export const JAM_KERJA_HARIAN = 8

/** Batas atas jam lembur sehari. Di atas ini hampir pasti salah ketik. */
export const LEMBUR_MAKS = 12

export type StatusHadir = 'hadir' | 'setengah' | 'izin' | 'alpa'

export interface BarisAbsensi {
  nama: string
  /** Tukang batu, kenek, mandor… Boleh kosong. */
  peran?: string
  status: StatusHadir
  /** Jam lembur hari itu. Disimpan terpisah, tidak pernah dilebur ke HOK. */
  lembur?: number
}

export const STATUS_HADIR: Array<{
  key: StatusHadir; label: string; pendek: string; hok: number; tone: string
}> = [
  { key: 'hadir', label: 'Hadir', pendek: 'H', hok: 1, tone: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'setengah', label: '½ Hari', pendek: '½', hok: 0.5, tone: 'bg-amber-500 text-white border-amber-500' },
  { key: 'izin', label: 'Izin', pendek: 'I', hok: 0, tone: 'bg-blue-600 text-white border-blue-600' },
  { key: 'alpa', label: 'Alpa', pendek: 'A', hok: 0, tone: 'bg-red-600 text-white border-red-600' },
]

/** Nilai HOK sebuah status. Status yang tidak dikenal bernilai 0, bukan 1. */
export function hokStatus(status: unknown): number {
  return STATUS_HADIR.find(s => s.key === status)?.hok ?? 0
}

export function labelStatus(status: unknown): string {
  return STATUS_HADIR.find(s => s.key === status)?.label ?? '—'
}

/**
 * Gelar depan yang dipakai orang untuk nama yang sama.
 *
 * Mandor menulis "Pak Yono" hari ini dan "Yono" besok — dan tanpa ini, rekap
 * upahnya memperlihatkan dua orang yang masing-masing bekerja separuh bulan.
 * Konsekuensinya jujur: dua orang yang HANYA dibedakan gelar akan menyatu.
 * Itu sudah menjadi sifat rekap yang berkunci nama, dengan atau tanpa daftar
 * ini — dan daftar saran nama yang muncul saat mengetik dibuat justru supaya
 * hal itu tidak sampai terjadi.
 */
const GELAR = /^(?:pak|bapak|bpk|bu|ibu|mas|mbak|bang|kang|abang|haji|hj|h)\.?\s+/i

/** Kunci penggabungan nama: tanpa gelar, tanpa beda huruf besar & spasi. */
export function kunciPekerja(nama: unknown): string {
  let s = String(nama ?? '').trim().replace(/\s+/g, ' ')
  // Berulang: "Pak Haji Yono" memakai dua gelar sekaligus.
  for (let i = 0; i < 3; i++) {
    const potong = s.replace(GELAR, '')
    if (potong === s || !potong.trim()) break
    s = potong
  }
  return s.toLowerCase()
}

/** Nama rapi untuk ditampilkan: spasi tunggal, tanpa spasi di ujung. */
export function rapikanNama(nama: unknown): string {
  return String(nama ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Baca absensi dari jsonb apa adanya menjadi bentuk yang bisa dipercaya.
 *
 * Yang datang dari basis data bisa berupa apa saja — kolomnya baru, barisnya
 * lama, dan baris lama tidak punya kolom ini sama sekali. Yang tidak berbentuk
 * dibuang diam-diam; laporan hariannya sendiri harus tetap tampil.
 */
export function bacaAbsensi(mentah: unknown): BarisAbsensi[] {
  if (!Array.isArray(mentah)) return []
  const out: BarisAbsensi[] = []
  for (const item of mentah) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const nama = rapikanNama(o.nama)
    if (nama.length < 2) continue
    const status = STATUS_HADIR.some(s => s.key === o.status)
      ? o.status as StatusHadir
      : 'hadir'
    const lembur = Number(o.lembur)
    out.push({
      nama,
      peran: rapikanNama(o.peran) || undefined,
      status,
      lembur: Number.isFinite(lembur) && lembur > 0 ? Math.min(lembur, LEMBUR_MAKS) : undefined,
    })
  }
  return out
}

export interface PeriksaAbsensi {
  ok: boolean
  pesan: string
}

/**
 * Apakah absensi ini layak dikirim.
 *
 * Absensi KOSONG itu sah: tidak semua proyek memakainya, dan laporan harian
 * tetap harus bisa dikirim tanpa mengisi satu nama pun.
 */
export function siapKirimAbsensi(baris: BarisAbsensi[]): PeriksaAbsensi {
  if (baris.length === 0) return { ok: true, pesan: '' }

  const terlihat = new Set<string>()
  for (const b of baris) {
    const nama = rapikanNama(b.nama)
    if (nama.length < 2) return { ok: false, pesan: 'Ada baris absensi yang namanya belum diisi.' }

    const kunci = kunciPekerja(nama)
    if (terlihat.has(kunci)) {
      return { ok: false, pesan: `"${nama}" tercatat dua kali. Hapus salah satunya.` }
    }
    terlihat.add(kunci)

    const lembur = Number(b.lembur ?? 0)
    if (!Number.isFinite(lembur) || lembur < 0) {
      return { ok: false, pesan: `Jam lembur ${nama} tidak masuk akal.` }
    }
    if (lembur > LEMBUR_MAKS) {
      return { ok: false, pesan: `Jam lembur ${nama} lebih dari ${LEMBUR_MAKS} jam — periksa lagi.` }
    }
  }
  return { ok: true, pesan: '' }
}

/** "5 hadir · 1 izin · 4 jam lembur". Kosong bila tidak ada absensi. */
export function ringkasAbsensi(baris: BarisAbsensi[]): string {
  if (!baris.length) return ''
  const bagian: string[] = []
  for (const s of STATUS_HADIR) {
    const n = baris.filter(b => b.status === s.key).length
    if (n > 0) bagian.push(`${n} ${s.label.toLowerCase()}`)
  }
  const lembur = baris.reduce((t, b) => t + (Number(b.lembur) || 0), 0)
  if (lembur > 0) bagian.push(`${bulat(lembur)} jam lembur`)
  return bagian.join(' · ')
}

/** Angka tanpa desimal yang tidak perlu: 1 tetap "1", 0,5 jadi "0,5". */
export function bulat(n: number): string {
  const v = Number(n) || 0
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export interface RekapPekerja {
  kunci: string
  nama: string
  peran: string
  hadir: number
  setengah: number
  izin: number
  alpa: number
  /** Hari orang kerja: hadir 1, setengah hari 0,5. */
  hok: number
  jamLembur: number
  /** Tanggal-tanggal yang tercatat, terbaru lebih dulu. */
  tanggal: string[]
}

/** Bentuk laporan seminimal yang dibutuhkan rekap. */
export interface SumberAbsensi {
  tanggal: string
  absensi?: BarisAbsensi[] | null
}

/**
 * Rekap kehadiran per pekerja dari sekumpulan laporan harian.
 *
 * SATU ORANG, SATU TANGGAL, SATU HITUNGAN. Dua mandor yang sama-sama melapor
 * di hari yang sama akan menyebut nama tukang yang sama, dan tanpa penjagaan
 * ini rekapnya menghitungnya dua hari kerja — persis cacat yang membuat orang
 * berhenti mempercayai angka absensi. Yang dipakai adalah catatan PERTAMA yang
 * ditemui untuk pasangan (pekerja, tanggal); pemanggilnya mengurutkan laporan
 * dari yang terbaru, jadi ralat yang dikirim belakangan itulah yang menang.
 */
export function rekapAbsensi(laporan: SumberAbsensi[]): RekapPekerja[] {
  const peta = new Map<string, RekapPekerja>()
  const sudah = new Set<string>()   // `${kunci}@${tanggal}`

  for (const lap of laporan ?? []) {
    const tgl = String(lap?.tanggal ?? '').slice(0, 10)
    for (const b of bacaAbsensi(lap?.absensi)) {
      const kunci = kunciPekerja(b.nama)
      if (!kunci) continue

      const cap = `${kunci}@${tgl}`
      if (sudah.has(cap)) continue
      sudah.add(cap)

      let r = peta.get(kunci)
      if (!r) {
        r = {
          kunci, nama: rapikanNama(b.nama), peran: b.peran ?? '',
          hadir: 0, setengah: 0, izin: 0, alpa: 0, hok: 0, jamLembur: 0, tanggal: [],
        }
        peta.set(kunci, r)
      }
      // Nama TERPANJANG yang dipakai menampilkan: "Pak Yono" lebih mudah
      // dikenali di daftar upah daripada "Yono", dan keduanya orang yang sama.
      const nama = rapikanNama(b.nama)
      if (nama.length > r.nama.length) r.nama = nama
      if (!r.peran && b.peran) r.peran = b.peran

      r[b.status] += 1
      r.hok += hokStatus(b.status)
      r.jamLembur += Number(b.lembur) || 0
      if (tgl) r.tanggal.push(tgl)
    }
  }

  for (const r of peta.values()) r.tanggal.sort((a, b) => b.localeCompare(a))

  return [...peta.values()].sort(
    (a, b) => b.hok - a.hok || a.nama.localeCompare(b.nama, 'id-ID'),
  )
}

export interface TotalRekap {
  pekerja: number
  hok: number
  jamLembur: number
  hadir: number
  setengah: number
  izin: number
  alpa: number
}

/** Jumlah seluruh baris rekap — untuk baris terbawah tabel. */
export function totalRekap(rekap: RekapPekerja[]): TotalRekap {
  return (rekap ?? []).reduce<TotalRekap>((t, r) => ({
    pekerja: t.pekerja + 1,
    hok: t.hok + r.hok,
    jamLembur: t.jamLembur + r.jamLembur,
    hadir: t.hadir + r.hadir,
    setengah: t.setengah + r.setengah,
    izin: t.izin + r.izin,
    alpa: t.alpa + r.alpa,
  }), { pekerja: 0, hok: 0, jamLembur: 0, hadir: 0, setengah: 0, izin: 0, alpa: 0 })
}

/**
 * Daftar pekerja yang pernah tercatat, untuk saran nama saat mengisi.
 *
 * Inilah yang membuat absensi harian jadi pekerjaan mengetuk, bukan mengetik
 * — dan sekaligus yang menjaga nama tetap ditulis sama tiap hari.
 */
export function daftarPekerja(laporan: SumberAbsensi[]): Array<{ nama: string; peran: string }> {
  return rekapAbsensi(laporan).map(r => ({ nama: r.nama, peran: r.peran }))
}

/**
 * Saran nama untuk sepotong ketikan; seluruh daftar bila ketikannya kosong.
 * Nama yang SUDAH dipakai di absensi hari ini dibuang dari saran — menawarkan
 * orang yang sudah ada di daftar hanya mengundang baris kembar.
 */
export function cariPekerja(
  daftar: Array<{ nama: string; peran: string }>,
  ketikan: string,
  dipakai: string[] = [],
): Array<{ nama: string; peran: string }> {
  const q = kunciPekerja(ketikan)
  const sudah = new Set(dipakai.map(kunciPekerja))
  return (daftar ?? [])
    .filter(d => !sudah.has(kunciPekerja(d.nama)))
    .filter(d => !q || kunciPekerja(d.nama).includes(q) || d.peran.toLowerCase().includes(q))
    .slice(0, 8)
}
