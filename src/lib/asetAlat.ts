// ============================================================
// PropFS — Aset & alat kerja perusahaan
//
// Genset, scaffolding, mesin las, molen. Barang yang dibeli sekali lalu
// dipakai bertahun-tahun di proyek yang berganti-ganti.
//
// Bedanya dengan material proyek ada dua, dan keduanya menentukan seluruh isi
// berkas ini:
//
//   1. Alat TIDAK HABIS. Semen yang dipakai berkurang; genset tidak. Kalau
//      alat ikut dihitung sebagai persediaan proyek, ia akan terlihat
//      "menumpuk tak terpakai" selamanya — karena memang tidak pernah habis.
//
//   2. Harganya TIDAK seluruhnya menjadi beban di bulan pembelian. Genset 50
//      juta yang dipakai lima tahun membebani laba sekitar 833 ribu sebulan,
//      bukan 50 juta sekaligus. Kalau seluruhnya dibebankan di bulan pertama,
//      bulan itu terlihat rugi besar dan 59 bulan sesudahnya terlihat untung
//      lebih besar daripada yang sebenarnya.
//
// Penyusutannya GARIS LURUS saja. Saldo menurun memang ada di buku akuntansi,
// tetapi satu metode yang benar untuk semua orang lebih berguna daripada
// pilihan yang salah dipilih oleh orang yang tidak diminta memilihnya.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

export type KondisiAlat = 'baik' | 'perlu_servis' | 'rusak'

export const LABEL_KONDISI: Record<KondisiAlat, string> = {
  baik: 'Baik',
  perlu_servis: 'Perlu Servis',
  rusak: 'Rusak',
}

export const TONE_KONDISI: Record<KondisiAlat, string> = {
  baik: 'bg-emerald-100 text-emerald-700',
  perlu_servis: 'bg-amber-100 text-amber-700',
  rusak: 'bg-rose-100 text-rose-700',
}

export interface AsetAlat {
  id: string
  nama: string
  kode: string
  merek: string
  nomor_seri: string
  /** YYYY-MM-DD */
  tanggal_beli: string
  harga: number
  /** Umur ekonomis dalam bulan. 0 = sengaja tidak disusutkan. */
  umur_bulan: number
  /** Nilai sisa saat umurnya habis. Penyusutan berhenti di sini. */
  nilai_residu: number
  kondisi: KondisiAlat
  /** Proyek tempat alat ini berada sekarang; kosong = di gudang. */
  lokasi_project_id: string | null
  lokasi_nama: string
  pemegang: string
  /** PO asal pembeliannya, bila dibeli lewat Procurement. */
  po_id: string | null
  catatan: string
  /** Terisi bila alat dijual/dihapusbukukan — penyusutannya berhenti. */
  dilepas_at: string | null
  created_at?: string
}

export const ASET_KOSONG: Omit<AsetAlat, 'id'> = {
  nama: '', kode: '', merek: '', nomor_seri: '',
  tanggal_beli: '', harga: 0, umur_bulan: 60, nilai_residu: 0,
  kondisi: 'baik', lokasi_project_id: null, lokasi_nama: '', pemegang: '',
  po_id: null, catatan: '', dilepas_at: null,
}

/** Umur ekonomis yang lazim, supaya tidak perlu ditebak sendiri tiap kali. */
export const PILIHAN_UMUR: Array<{ bulan: number; label: string }> = [
  { bulan: 24, label: '2 tahun' },
  { bulan: 48, label: '4 tahun' },
  { bulan: 60, label: '5 tahun' },
  { bulan: 96, label: '8 tahun' },
  { bulan: 0, label: 'Tidak disusutkan' },
]

const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Tanggal yang bisa dipakai, atau null. Menolak string yang bukan tanggal. */
function tanggal(v: unknown): Date | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Berapa lama alat ini sudah dipakai, dalam bulan penuh.
 *
 * Tidak pernah negatif: alat yang tanggal belinya di masa depan (salah ketik
 * tahun, atau pembelian yang dicatat lebih awal) belum menyusut sama sekali —
 * bukan menyusut terbalik sehingga nilainya melebihi harga belinya.
 *
 * Berhenti di `dilepas_at`. Alat yang sudah dijual tidak menyusut lagi;
 * membiarkannya menyusut berarti nilainya terus turun setelah ia tidak lagi
 * dimiliki.
 */
export function bulanBerjalan(a: Partial<AsetAlat> | null | undefined, hariIni = new Date()): number {
  const beli = tanggal(a?.tanggal_beli)
  if (!beli) return 0
  const lepas = tanggal(a?.dilepas_at)
  const akhir = lepas && lepas < hariIni ? lepas : hariIni
  const bulan = (akhir.getFullYear() - beli.getFullYear()) * 12
    + (akhir.getMonth() - beli.getMonth())
    // Bulan dihitung penuh: tanggal 3 Agustus dari pembelian 20 Juli belum
    // genap sebulan, jadi belum menyusut sebulan.
    - (akhir.getDate() < beli.getDate() ? 1 : 0)
  return Math.max(0, bulan)
}

/**
 * Beban penyusutan sebulan.
 *
 * `umur_bulan` nol atau minus berarti alat ini sengaja tidak disusutkan —
 * tanah, atau barang yang nilainya dianggap tetap. Membaginya dengan nol akan
 * melahirkan Infinity yang mengalir sampai ke neraca.
 */
export function penyusutanBulanan(a: Partial<AsetAlat> | null | undefined): number {
  const umur = angka(a?.umur_bulan)
  if (umur <= 0) return 0
  const dasar = Math.max(0, angka(a?.harga) - angka(a?.nilai_residu))
  return dasar / umur
}

/**
 * Penyusutan yang sudah terkumpul sampai hari ini.
 *
 * DIBATASI pada `harga − nilai_residu`. Tanpa batas itu, alat yang umur
 * ekonomisnya sudah lewat akan terus menyusut sampai nilainya minus — dan
 * aset bernilai minus akan mengurangi total aset perusahaan, yaitu kebalikan
 * dari yang seharusnya terjadi pada barang yang masih ada di gudang.
 */
export function akumulasiPenyusutan(
  a: Partial<AsetAlat> | null | undefined, hariIni = new Date(),
): number {
  const dasar = Math.max(0, angka(a?.harga) - angka(a?.nilai_residu))
  const per = penyusutanBulanan(a)
  if (per <= 0) return 0
  return Math.min(dasar, per * bulanBerjalan(a, hariIni))
}

/**
 * Nilai alat ini sekarang — inilah yang masuk neraca.
 *
 * Tidak pernah di bawah `nilai_residu`, dan tidak pernah di atas harga
 * perolehannya.
 */
export function nilaiBuku(
  a: Partial<AsetAlat> | null | undefined, hariIni = new Date(),
): number {
  const harga = Math.max(0, angka(a?.harga))
  const residu = Math.min(harga, Math.max(0, angka(a?.nilai_residu)))
  return Math.max(residu, harga - akumulasiPenyusutan(a, hariIni))
}

/** Sisa umur ekonomis dalam bulan; 0 bila sudah habis atau tidak disusutkan. */
export function sisaUmur(
  a: Partial<AsetAlat> | null | undefined, hariIni = new Date(),
): number {
  const umur = angka(a?.umur_bulan)
  if (umur <= 0) return 0
  return Math.max(0, umur - bulanBerjalan(a, hariIni))
}

/** Alat yang masih dimiliki perusahaan — yang sudah dilepas tidak ikut. */
export function masihDimiliki(a: Partial<AsetAlat> | null | undefined): boolean {
  return !String(a?.dilepas_at ?? '').trim()
}

/**
 * Nilai buku seluruh alat yang masih dimiliki.
 *
 * Inilah angka yang diserahkan ke `hitungNeraca`. Alat yang sudah dilepas
 * tidak ikut: barangnya sudah tidak ada, jadi tidak boleh menambah aset.
 */
export function totalAsetTetap(
  daftar: Array<Partial<AsetAlat>> | null | undefined, hariIni = new Date(),
): number {
  return (daftar ?? [])
    .filter(masihDimiliki)
    .reduce((s, a) => s + nilaiBuku(a, hariIni), 0)
}

/** Harga perolehan seluruh alat yang masih dimiliki. */
export function totalPerolehan(
  daftar: Array<Partial<AsetAlat>> | null | undefined,
): number {
  return (daftar ?? [])
    .filter(masihDimiliki)
    .reduce((s, a) => s + Math.max(0, angka(a?.harga)), 0)
}

/** Beban penyusutan bulan ini dari seluruh alat yang masih disusutkan. */
export function penyusutanBulanIni(
  daftar: Array<Partial<AsetAlat>> | null | undefined, hariIni = new Date(),
): number {
  return (daftar ?? [])
    .filter(masihDimiliki)
    // Alat yang umurnya sudah habis tidak lagi membebani laba.
    .filter(a => sisaUmur(a, hariIni) > 0)
    .reduce((s, a) => s + penyusutanBulanan(a), 0)
}

/**
 * Di mana alat ini sekarang, dalam satu kalimat siap tampil.
 *
 * Nama proyek dicari dari daftar proyek supaya nama yang berubah ikut
 * terbarui; `lokasi_nama` yang tersimpan hanya cadangan untuk proyek yang
 * sudah tidak ada.
 */
export function lokasiAlat(
  a: Partial<AsetAlat> | null | undefined,
  daftarProyek: ReadonlyArray<{ id: string; nama: string }> | null | undefined = [],
): string {
  if (!masihDimiliki(a)) return 'Sudah dilepas'
  const id = String(a?.lokasi_project_id ?? '').trim()
  if (!id) return 'Gudang'
  const ketemu = (daftarProyek ?? []).find(p => String(p?.id ?? '').trim() === id)
  return String(ketemu?.nama ?? a?.lokasi_nama ?? '').trim() || 'Proyek (tidak dikenal)'
}

/**
 * Apa yang harus terisi sebelum alat boleh dicatat.
 *
 * Harga nol DITOLAK di sini — berbeda dari baris PO, yang harganya boleh
 * menyusul. Aset bernilai nol tidak menambah apa pun ke neraca dan tidak
 * menyusut apa pun; ia hanya menjadi baris yang membingungkan di daftar.
 */
export function siapSimpanAset(
  a: Partial<AsetAlat> | null | undefined,
): { boleh: boolean; alasan: string } {
  if (!String(a?.nama ?? '').trim()) return { boleh: false, alasan: 'Nama alat belum diisi.' }
  if (!tanggal(a?.tanggal_beli)) return { boleh: false, alasan: 'Tanggal beli belum diisi.' }
  if (!(angka(a?.harga) > 0)) return { boleh: false, alasan: 'Harga perolehan masih nol.' }
  if (angka(a?.umur_bulan) < 0) return { boleh: false, alasan: 'Umur ekonomis tidak boleh minus.' }
  if (angka(a?.nilai_residu) < 0) return { boleh: false, alasan: 'Nilai residu tidak boleh minus.' }
  if (angka(a?.nilai_residu) > angka(a?.harga)) {
    return { boleh: false, alasan: 'Nilai residu tidak boleh melebihi harga perolehan.' }
  }
  return { boleh: true, alasan: '' }
}
