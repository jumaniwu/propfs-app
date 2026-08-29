// ============================================================
// PropFS — Absen dengan mencentang, bukan menambah satu per satu
//
// Bentuk lamanya menuntut DUA langkah per orang: ketuk namanya supaya
// barisnya muncul, lalu pilih statusnya di antara empat tombol. Untuk lima
// belas tukang itu tiga puluh ketukan setiap sore, dari HP, oleh orang yang
// baru selesai memegang semen.
//
// Yang sebenarnya terjadi di lapangan jauh lebih sederhana: hampir semua orang
// masuk, dan yang perlu ditandai justru YANG TIDAK. Maka bentuk yang benar
// adalah daftar centang — seluruh pekerja terdaftar tampil sekaligus, mencentang
// berarti hadir, dan status lain hanya disentuh untuk satu-dua orang yang
// memang berbeda.
//
// Perbedaannya bukan soal kenyamanan. Absensi yang merepotkan diisi
// belakangan, dikira-kira dari ingatan, atau tidak diisi sama sekali — dan
// upah dihitung dari situ.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================
import { hokStatus, kunciPekerja, rapikanNama, type BarisAbsensi, type StatusHadir } from './absensiPekerja.ts'
import type { PekerjaLapangan } from './pekerjaLapangan.ts'

const teks = (v: unknown): string => String(v ?? '').trim()
const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Satu baris di daftar centang: seorang pekerja terdaftar, hadir atau tidak. */
export interface BarisCentang {
  /** `pekerja_id` bila terdaftar; kunci nama bila hanya ada di absensi lama. */
  kunci: string
  pekerja_id: string
  nama: string
  peran: string
  foto: string
  /** Dicentang = ikut dikirim. Tidak dicentang = tidak masuk hitungan sama sekali. */
  dicentang: boolean
  status: StatusHadir
  lembur: number
  /** Foto bukti hadir hari itu, bukan foto profilnya. */
  fotoAbsen: string
  /** Pekerja ini tidak ada lagi di daftar, tetapi absensinya sudah terisi. */
  yatim: boolean
}

/**
 * Susun daftar centang dari pekerja terdaftar + absensi yang sudah ada.
 *
 * Pekerja terdaftar SELALU muncul, dicentang atau tidak. Itu inti bentuk ini:
 * daftar yang hanya menampilkan yang sudah diabsen tidak pernah mengingatkan
 * siapa yang terlewat, dan yang terlewat adalah orang yang tidak dibayar.
 *
 * Baris absensi yang pekerjanya sudah tidak terdaftar tetap ditampilkan di
 * bawah, ditandai `yatim`. Membuangnya berarti diam-diam menghapus kehadiran
 * yang sudah dicatat — dan yang menghilang justru catatan orang yang sudah
 * berhenti, yaitu orang yang paling mungkin masih menagih upah.
 */
export function susunCentang(
  pekerja: PekerjaLapangan[] | null | undefined,
  baris: BarisAbsensi[] | null | undefined,
): BarisCentang[] {
  const terisi = new Map<string, BarisAbsensi>()
  for (const b of baris ?? []) {
    const nama = rapikanNama(b?.nama)
    if (!nama) continue
    const k = teks(b?.pekerja_id) || kunciPekerja(nama)
    if (k) terisi.set(k, b)
  }

  const hasil: BarisCentang[] = []
  const dipakai = new Set<string>()

  for (const p of pekerja ?? []) {
    if (p?.aktif === false) continue
    const k = teks(p.id) || kunciPekerja(p.nama)
    const ada = terisi.get(k) ?? terisi.get(kunciPekerja(p.nama))
    if (ada) dipakai.add(teks(ada.pekerja_id) || kunciPekerja(ada.nama))
    hasil.push({
      kunci: k,
      pekerja_id: teks(p.id),
      nama: p.nama,
      peran: teks(p.peran),
      foto: teks(p.foto),
      dicentang: !!ada,
      status: (ada?.status ?? 'hadir') as StatusHadir,
      lembur: angka(ada?.lembur),
      fotoAbsen: teks(ada?.foto),
      yatim: false,
    })
  }

  for (const [k, b] of terisi) {
    if (dipakai.has(k)) continue
    hasil.push({
      kunci: k, pekerja_id: teks(b.pekerja_id), nama: rapikanNama(b.nama),
      peran: teks(b.peran), foto: '',
      dicentang: true, status: (b.status ?? 'hadir') as StatusHadir,
      lembur: angka(b.lembur), fotoAbsen: teks(b.foto), yatim: true,
    })
  }
  return hasil
}

/** Kembalikan ke bentuk yang dikirim: hanya yang dicentang. */
export function centangKeAbsensi(daftar: BarisCentang[] | null | undefined): BarisAbsensi[] {
  return (daftar ?? [])
    .filter(r => r.dicentang && teks(r.nama))
    .map(r => {
      const b: BarisAbsensi = { nama: r.nama, status: r.status }
      if (r.pekerja_id) b.pekerja_id = r.pekerja_id
      if (r.peran) b.peran = r.peran
      // Lembur hanya ikut bila ada. Menulis `lembur: 0` ke setiap baris
      // membuat rekap yang membedakan "tanpa lembur" dari "belum diisi"
      // kehilangan bedanya.
      if (r.lembur > 0) b.lembur = r.lembur
      if (r.fotoAbsen) b.foto = r.fotoAbsen
      return b
    })
}

/** Centang/lepas satu orang. Melepas TIDAK menghapus status & lemburnya. */
export function alihCentang(daftar: BarisCentang[], kunci: string): BarisCentang[] {
  return daftar.map(r => r.kunci === kunci ? { ...r, dicentang: !r.dicentang } : r)
}

/** Ubah satu baris. */
export function ubahBaris(
  daftar: BarisCentang[], kunci: string, patch: Partial<BarisCentang>,
): BarisCentang[] {
  return daftar.map(r => {
    if (r.kunci !== kunci) return r
    const baru = { ...r, ...patch }
    // Menyentuh status apa pun berarti orang ini masuk hitungan hari itu.
    // Tanpa ini, menandai seseorang IZIN pada baris yang belum dicentang tidak
    // menghasilkan apa-apa — dan yang menandainya mengira sudah tercatat.
    if (patch.status) baru.dicentang = true
    // Jam lembur untuk orang yang tidak masuk tidak masuk akal.
    if (baru.status === 'izin' || baru.status === 'alpa') baru.lembur = 0
    return baru
  })
}

/** Centang semuanya sebagai hadir — pekerjaan paling sering di layar ini. */
export function centangSemua(daftar: BarisCentang[]): BarisCentang[] {
  return daftar.map(r => r.dicentang ? r : { ...r, dicentang: true, status: 'hadir' as StatusHadir })
}

export function lepasSemua(daftar: BarisCentang[]): BarisCentang[] {
  return daftar.map(r => ({ ...r, dicentang: false }))
}

export interface RingkasCentang {
  dicentang: number
  total: number
  hadir: number
  setengah: number
  izin: number
  alpa: number
  jamLembur: number
  hok: number
}

export function ringkasCentang(daftar: BarisCentang[] | null | undefined): RingkasCentang {
  const r: RingkasCentang = {
    dicentang: 0, total: (daftar ?? []).length,
    hadir: 0, setengah: 0, izin: 0, alpa: 0, jamLembur: 0, hok: 0,
  }
  for (const b of daftar ?? []) {
    if (!b.dicentang) continue
    r.dicentang += 1
    if (b.status === 'hadir' || b.status === 'setengah' || b.status === 'izin' || b.status === 'alpa') {
      r[b.status] += 1
    }
    r.jamLembur += angka(b.lembur)
    r.hok += hokStatus(b.status)
  }
  return r
}

/**
 * Kalimat ringkas di kepala daftar.
 *
 * Menyebut yang BELUM dicentang, bukan hanya yang sudah. Yang terlewat adalah
 * orang yang tidak dibayar, dan tidak ada yang mengingatkannya selain baris ini.
 */
export function kalimatCentang(r: RingkasCentang | null | undefined): string {
  if (!r || r.total === 0) return 'Belum ada pekerja terdaftar'
  if (r.dicentang === 0) return `Belum ada yang dicentang dari ${r.total} pekerja`
  const bagian = [`${r.dicentang} dari ${r.total} dicentang`]
  if (r.izin > 0) bagian.push(`${r.izin} izin`)
  if (r.alpa > 0) bagian.push(`${r.alpa} alpa`)
  if (r.jamLembur > 0) bagian.push(`${r.jamLembur} jam lembur`)
  const sisa = r.total - r.dicentang
  if (sisa > 0) bagian.push(`${sisa} belum ditandai`)
  return bagian.join(' · ')
}
