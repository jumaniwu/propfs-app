// ============================================================
// PropFS — Menarik kembali pemasukan yang hilang, dari kwitansinya
//
// KENAPA BERKAS INI ADA.
//
// Pemasukan hidup di `akuntan_data` sebagai SATU dokumen JSON per pemakai:
// seluruh daftar pemasukan, biaya umum, dan penyesuaian stok dalam satu
// baris, yang ditulis ulang utuh setiap kali ada perubahan. Bentuk seperti
// itu punya satu cara gagal yang sangat mahal — satu penulisan yang keliru
// menghapus SEMUANYA sekaligus, bukan satu baris.
//
// Kwitansi tidak begitu. Tiap kwitansi adalah BARIS tersendiri di tabelnya
// sendiri, dan ia menyimpan `pemasukan_id` — id entri pemasukan yang menjadi
// asalnya. Jadi setiap kwitansi yang pernah terbit adalah bukti tahan lama
// bahwa sebuah entri pemasukan pernah ada, lengkap dengan tanggal, nominal,
// pembayar, dan uraiannya.
//
// Itulah yang dipakai di sini. Bukan menebak: memulihkan dari catatan yang
// justru dibuat untuk dipertanggungjawabkan.
//
// TIGA HAL YANG SENGAJA TIDAK DILAKUKAN.
//
// 1. Entri yang masih ada TIDAK disentuh. Yang dipulihkan hanya yang
//    id-nya tidak ditemukan lagi. Menimpa yang ada berarti membuang suntingan
//    yang mungkin sudah dilakukan sesudah kwitansinya terbit.
//
// 2. Entri yang SENGAJA DIHAPUS tidak dihidupkan lagi. Store menyimpan nisan
//    (`hapusan`) justru supaya penghapusan tidak dibatalkan diam-diam oleh
//    sinkronisasi berikutnya. Memulihkannya di sini akan mengulang persoalan
//    yang nisan itu ada untuk mencegahnya.
//
// 3. Kwitansi TANPA `pemasukan_id` tidak dipulihkan. Ia terbit sebelum
//    kolomnya ada, atau dibuat lepas dari entri mana pun — dan membuatkan
//    entri baru untuknya berisiko menghitung uang yang sama dua kali, karena
//    entri aslinya bisa saja masih ada dengan id yang berbeda.
//
//    Jumlahnya dilaporkan, bukan didiamkan: yang membacanya harus tahu ada
//    sesuatu yang tidak ikut dipulihkan, dan kenapa.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { PemasukanEntry } from './akuntan.ts'

const teks = (v: unknown): string => String(v ?? '').trim()
const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Seminimal yang dibutuhkan dari sebuah baris kwitansi. */
export interface KwitansiRingkas {
  id?: string
  nomor?: string
  tanggal?: string
  jumlah?: number | string
  pemasukan_id?: string
  penerima_dari?: string
  untuk_pembayaran?: string
  project_name?: string
  catatan?: string
}

export interface RencanaPulih {
  /** Entri yang akan ditambahkan kembali. */
  entri: PemasukanEntry[]
  /** Nominal seluruhnya, untuk dicocokkan mata sebelum menekan tombol. */
  totalRupiah: number
  /** Kwitansi yang tidak bisa dipulihkan, beserta sebabnya. */
  dilewati: Array<{ nomor: string; sebab: string }>
}

/**
 * Kategori entri hasil pemulihan.
 *
 * Selalu 'termin'. Kwitansi tidak menyimpan kategori aslinya, dan menebaknya
 * dari kata-kata di uraian akan salah tanpa ada yang tahu. 'termin' adalah
 * yang paling sering benar untuk uang yang berkwitansi, dan yang paling mudah
 * dikoreksi kalau meleset — berbeda dengan 'modal', yang bila keliru akan
 * mengubah tafsir seluruh laporannya.
 */
const KATEGORI_PULIH: PemasukanEntry['kategori'] = 'termin'

/**
 * Susun daftar pemasukan yang perlu dikembalikan.
 *
 * `hapusan` adalah daftar nisan dari store: id yang memang sengaja dihapus.
 * Bentuknya boleh larik id atau larik objek ber-`id`.
 */
export function rencanaPulih(
  kwitansi: KwitansiRingkas[] | null | undefined,
  pemasukanSekarang: Array<{ id?: string }> | null | undefined,
  hapusan?: Array<string | { id?: string }> | null,
): RencanaPulih {
  const ada = new Set(
    (pemasukanSekarang ?? []).map(p => teks(p?.id)).filter(Boolean),
  )
  const nisan = new Set(
    (hapusan ?? [])
      .map(h => typeof h === 'string' ? teks(h) : teks(h?.id))
      .filter(Boolean),
  )

  const entri: PemasukanEntry[] = []
  const dilewati: Array<{ nomor: string; sebab: string }> = []
  // Satu entri pemasukan bisa punya lebih dari satu kwitansi (dicetak ulang,
  // dikirim ulang). Tanpa penjaga ini uangnya akan dihitung dua kali.
  const sudah = new Set<string>()

  for (const k of kwitansi ?? []) {
    const nomor = teks(k?.nomor) || teks(k?.id) || '(tanpa nomor)'
    const idAsal = teks(k?.pemasukan_id)

    if (!idAsal) {
      dilewati.push({ nomor, sebab: 'kwitansi ini tidak menyimpan id pemasukan asalnya' })
      continue
    }
    if (ada.has(idAsal)) continue                    // masih ada, tidak diapa-apakan
    if (nisan.has(idAsal)) {
      dilewati.push({ nomor, sebab: 'entrinya memang sengaja dihapus' })
      continue
    }
    if (sudah.has(idAsal)) continue                  // kwitansi kedua untuk entri yang sama

    const jumlah = angka(k?.jumlah)
    if (jumlah <= 0) {
      dilewati.push({ nomor, sebab: 'nominalnya nol' })
      continue
    }

    sudah.add(idAsal)
    entri.push({
      id: idAsal,
      tanggal: teks(k?.tanggal).slice(0, 10),
      // Uraian pembayaran adalah kalimat yang memang ditulis untuk dibaca
      // orang; nama pembayar dipakai bila uraiannya kosong.
      sumber: teks(k?.untuk_pembayaran) || teks(k?.penerima_dari) || `Kwitansi ${nomor}`,
      kategori: KATEGORI_PULIH,
      jumlah,
      keterangan: [
        `Dipulihkan dari kwitansi ${nomor}`,
        teks(k?.penerima_dari) && `diterima dari ${teks(k?.penerima_dari)}`,
        teks(k?.catatan),
      ].filter(Boolean).join(' · '),
    })
  }

  return {
    entri,
    totalRupiah: entri.reduce((s, e) => s + e.jumlah, 0),
    dilewati,
  }
}

/**
 * Kalimat yang dibaca sebelum menekan tombol.
 *
 * Menyebut jumlah dan NOMINALNYA. Angka rupiah itu yang bisa dicocokkan
 * dengan ingatan orang tentang uang yang masuk — "3 entri" tidak bisa.
 */
export function kalimatPulih(r: RencanaPulih | null | undefined): string {
  const n = r?.entri.length ?? 0
  if (n < 1) {
    return (r?.dilewati.length ?? 0) > 0
      ? 'Tidak ada pemasukan yang bisa dipulihkan dari kwitansi yang ada.'
      : 'Semua kwitansi sudah punya catatan pemasukannya.'
  }
  const rupiah = `Rp ${Math.round(r?.totalRupiah ?? 0).toLocaleString('id-ID')}`
  const bagian = [`${n} pemasukan senilai ${rupiah} akan dikembalikan dari kwitansi yang sudah terbit.`]
  if ((r?.dilewati.length ?? 0) > 0) {
    bagian.push(`${r?.dilewati.length} kwitansi dilewati — lihat rinciannya di bawah.`)
  }
  bagian.push('Entri yang masih ada tidak diubah sama sekali.')
  return bagian.join(' ')
}
