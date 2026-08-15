// ============================================================
// PropFS — Mengelompokkan daftar panjang per bulan
//
// Setiap daftar di aplikasi ini tumbuh dan tidak pernah menyusut: purchase
// order, tagihan vendor, pemasukan, kwitansi. Setelah setahun, mencari PO
// bulan lalu berarti menggulung melewati ratusan baris yang sudah selesai
// urusannya.
//
// Aturannya satu, dan sengaja sederhana:
//
//   - BULAN BERJALAN selalu terbuka. Itu yang sedang dikerjakan orang, dan
//     menyembunyikannya di balik satu ketukan berarti menambah satu ketukan
//     pada pekerjaan yang paling sering dilakukan.
//   - BULAN YANG SUDAH LEWAT terlipat, menyisakan satu baris berisi nama
//     bulan, jumlah barisnya, dan nilainya. Ia masih ada, masih bisa dibuka,
//     tetapi tidak lagi ikut memenuhi layar.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** Nilai khusus pemilih bulan: tampilkan seluruh bulan. */
export const SEMUA_BULAN = '__semua__'

/** Bulan untuk baris yang tanggalnya tidak terbaca. */
export const TANPA_TANGGAL = '__tanpa__'

/**
 * `2026-08-14T03:00:00Z` atau `2026-08-14` → `2026-08`.
 *
 * Dibaca dari TEKS-nya, bukan lewat `new Date()`. Tanggal di aplikasi ini
 * disimpan sebagai `YYYY-MM-DD` tanpa zona waktu; melewatkannya lewat Date
 * akan menggeser tanggal 1 pukul 00:00 ke bulan sebelumnya di setiap zona
 * waktu barat — dan seluruh pembelian tanggal 1 pindah bulan diam-diam.
 */
export function bulanDari(tanggal: unknown): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(tanggal ?? '').trim())
  if (!m) return TANPA_TANGGAL
  const bln = Number(m[2])
  return bln >= 1 && bln <= 12 ? `${m[1]}-${m[2]}` : TANPA_TANGGAL
}

/** `2026-08` → `Agustus 2026`. Yang tidak dikenal diberi nama apa adanya. */
export function labelBulanPanjang(bulan: unknown): string {
  const s = String(bulan ?? '').trim()
  if (s === TANPA_TANGGAL) return 'Tanpa tanggal'
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return s
  const nama = NAMA_BULAN[Number(m[2]) - 1]
  return nama ? `${nama} ${m[1]}` : s
}

/** Bulan berjalan menurut jam perangkat, dalam bentuk `YYYY-MM`. */
export function bulanBerjalan(hariIni = new Date()): string {
  return `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, '0')}`
}

export interface KelompokBulan<T> {
  /** `YYYY-MM`, atau TANPA_TANGGAL. */
  bulan: string
  label: string
  baris: T[]
  /** Jumlah nilai barisnya, bila `nilai` diberikan. */
  total: number
  /** Bulan berjalan — inilah yang ditampilkan terbuka. */
  berjalan: boolean
}

/**
 * Kelompokkan baris menurut bulan tanggalnya, terbaru lebih dulu.
 *
 * Baris yang tanggalnya tidak terbaca TIDAK dibuang — ia dikumpulkan ke
 * kelompok "Tanpa tanggal" yang diletakkan paling akhir. Membuangnya akan
 * membuat data hilang dari layar tanpa ada yang tahu; menaruhnya di bulan
 * berjalan akan membuatnya mengaku baru.
 */
export function kelompokPerBulan<T>(
  baris: readonly T[] | null | undefined,
  tanggalDari: (b: T) => unknown,
  opsi: { nilai?: (b: T) => number; hariIni?: Date } = {},
): Array<KelompokBulan<T>> {
  const kini = bulanBerjalan(opsi.hariIni ?? new Date())
  const peta = new Map<string, T[]>()

  for (const b of baris ?? []) {
    if (b == null) continue
    const bln = bulanDari(tanggalDari(b))
    const daftar = peta.get(bln)
    if (daftar) daftar.push(b)
    else peta.set(bln, [b])
  }

  const hasil: Array<KelompokBulan<T>> = []
  for (const [bulan, isi] of peta) {
    hasil.push({
      bulan,
      label: labelBulanPanjang(bulan),
      baris: isi,
      total: opsi.nilai ? isi.reduce((s, x) => s + (Number(opsi.nilai!(x)) || 0), 0) : 0,
      berjalan: bulan === kini,
    })
  }

  // Terbaru lebih dulu; "Tanpa tanggal" selalu paling akhir, berapa pun
  // isinya — ia bukan bulan, jadi tidak punya tempat di antara bulan-bulan.
  return hasil.sort((a, b) => {
    if (a.bulan === TANPA_TANGGAL) return 1
    if (b.bulan === TANPA_TANGGAL) return -1
    return b.bulan.localeCompare(a.bulan)
  })
}

export interface PilihanBulan {
  nilai: string
  label: string
  jumlah: number
}

/**
 * Isi pemilih bulan, termasuk "Semua bulan" di paling atas.
 *
 * Jumlah barisnya ikut ditulis. Bulan yang kosong tidak pernah muncul di
 * sini — pemilih yang menawarkan bulan tanpa isi adalah pemilih yang
 * membuang waktu orang.
 */
export function pilihanBulan<T>(
  kelompok: ReadonlyArray<KelompokBulan<T>> | null | undefined,
): PilihanBulan[] {
  const daftar = kelompok ?? []
  const semua = daftar.reduce((s, k) => s + k.baris.length, 0)
  return [
    { nilai: SEMUA_BULAN, label: `Semua bulan (${semua})`, jumlah: semua },
    ...daftar.map(k => ({ nilai: k.bulan, label: `${k.label} (${k.baris.length})`, jumlah: k.baris.length })),
  ]
}

/**
 * Saring kelompok menurut pilihan pemakainya.
 *
 * Bulan yang dipilih secara sengaja dibuka, walaupun ia bulan lama: orang
 * yang memilih Maret memang ingin melihat isi Maret, bukan satu baris terlipat
 * bertuliskan "Maret".
 */
export function saringBulan<T>(
  kelompok: ReadonlyArray<KelompokBulan<T>> | null | undefined,
  pilihan: string,
): Array<KelompokBulan<T>> {
  const daftar = [...(kelompok ?? [])]
  if (!pilihan || pilihan === SEMUA_BULAN) return daftar
  return daftar
    .filter(k => k.bulan === pilihan)
    .map(k => ({ ...k, berjalan: true }))
}
