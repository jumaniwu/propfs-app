// ============================================================
// PropFS — Kenapa layar ini kosong: dijawab, bukan dibiarkan ditebak
//
// Pilihan proyek di "Isi Laporan Lapangan" milik pengawas kosong, dan satu-
// satunya kalimat yang muncul adalah "Belum ada buku laporan. Buat dulu di
// Laporan Lapangan." Kalimat itu KELIRU untuk pengawas: bukunya sudah ada,
// dan ia memang tidak berhak membuatnya sendiri.
//
// Tiga keadaan yang sangat berbeda terlihat persis sama di layar:
//
//   1. Perusahaannya memang belum punya buku laporan sama sekali.
//   2. Akun ini belum terhubung ke perusahaan mana pun — jadi seluruh
//      kebijakan akses membacanya sebagai orang luar, dan tidak ada satu
//      baris pun yang boleh ia lihat.
//   3. Fungsi penghubungnya belum ada di basis data — migrasinya belum
//      dijalankan.
//
// Yang ketiga dan kedua tidak bisa diperbaiki oleh yang membaca layarnya,
// tetapi keduanya bisa DIBERITAHUKAN kepada orang yang bisa memperbaikinya.
// Menebak berulang kali, seperti yang terjadi berhari-hari, adalah akibat
// langsung dari layar yang menyebut ketiganya dengan kalimat yang sama.
//
// `my_workspaces()` menyaring `member_user_id = auth.uid()`, jadi daftar
// workspace yang KOSONG adalah bukti bahwa pengikatannya belum jadi. Itu
// sinyal yang bisa dibaca dari sisi aplikasi, tanpa perlu membuka basis data.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()

export interface KeadaanAkses {
  /** Berapa buku laporan yang benar-benar terlihat oleh akun ini. */
  jumlahBuku: number
  /** Perusahaan yang keanggotaannya sudah terbaca server. */
  jumlahWorkspace: number
  /** Fungsi team_klaim_keanggotaan ada di basis data. */
  adaFungsiKlaim: boolean
  /** Berapa keanggotaan yang baru saja terikat oleh percobaan terakhir. */
  baruTerikat: number
  /** Masuk lewat halaman login tim. */
  sesiTim: boolean
  /** Workspace perusahaan yang sedang dibuka; null = milik sendiri. */
  workspaceOwner: string | null
}

export interface Diagnosa {
  /** Ada yang perlu disampaikan? Kosong berarti keadaan ini memang wajar. */
  sebab: string
  /** Apa yang harus dilakukan, oleh siapa. */
  saran: string
  /** Menawarkan tombol "hubungkan akun" — hanya bila itu bisa menolong. */
  bolehCobaHubungkan: boolean
}

const KOSONG: Diagnosa = { sebab: '', saran: '', bolehCobaHubungkan: false }

/**
 * Jelaskan kenapa tidak ada buku laporan yang bisa dipilih.
 *
 * Urutannya disengaja: yang paling menentukan lebih dulu. Akun yang belum
 * terhubung tidak akan pernah melihat buku apa pun, jadi menyebut "belum ada
 * buku" kepadanya adalah menyesatkan — ia akan mencari-cari sesuatu yang
 * sebenarnya ada dan hanya tidak boleh ia lihat.
 */
export function diagnosaBuku(k: KeadaanAkses | null | undefined): Diagnosa {
  if (!k) return KOSONG
  if ((k.jumlahBuku ?? 0) > 0) return KOSONG      // tidak ada yang perlu dijelaskan

  // Baru saja tersambung. Ini kabar baik, dan harus dibedakan dari kegagalan.
  if ((k.baruTerikat ?? 0) > 0) {
    return {
      sebab: `Akun ini baru terhubung ke ${k.baruTerikat} perusahaan.`,
      saran: 'Ketuk tombol muat ulang di kanan atas — daftar proyeknya akan muncul.',
      bolehCobaHubungkan: false,
    }
  }

  if (!k.adaFungsiKlaim) {
    return {
      sebab: 'Penghubung akun ke perusahaan belum terpasang di basis data.',
      saran: 'Minta admin menjalankan migration_klaim_keanggotaan.sql'
        + ' di Supabase SQL Editor. Tanpa itu, akun tim tidak bisa melihat data perusahaan.',
      bolehCobaHubungkan: false,
    }
  }

  const anggota = !!k.sesiTim || !!teks(k.workspaceOwner)

  if ((k.jumlahWorkspace ?? 0) === 0) {
    return {
      sebab: 'Akun ini belum terhubung ke perusahaan mana pun.',
      // Sebabnya hampir selalu satu: email di menu Pengguna berbeda dengan
      // email yang dipakai masuk. Disebut langsung supaya yang membacanya
      // tidak menebak-nebak.
      saran: 'Minta admin memeriksa menu Pengguna: email Anda di sana harus SAMA PERSIS'
        + ' dengan email yang Anda pakai masuk, dan statusnya harus "aktif".'
        + ' Sesudah diperbaiki, ketuk "Hubungkan akun" di bawah.',
      bolehCobaHubungkan: true,
    }
  }

  // Terhubung, tetapi tetap tidak ada bukunya. Untuk anggota tim itu berarti
  // perusahaannya memang belum membuat satu pun.
  return {
    sebab: anggota
      ? 'Perusahaan Anda belum punya buku laporan.'
      : 'Belum ada buku laporan.',
    saran: anggota
      ? 'Minta admin membuatnya di menu Laporan Lapangan → "Buat Buku Laporan".'
      : 'Buat dulu di Laporan Lapangan, lalu proyeknya akan muncul di daftar ini.',
    bolehCobaHubungkan: false,
  }
}
