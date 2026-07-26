// ============================================================
// PropFS — Tautan WhatsApp (logika murni, tanpa DOM)
// Menormalkan nomor Indonesia ke format internasional supaya pesan langsung
// terbuka di chat orang yang dituju, bukan daftar kontak.
// ============================================================

/**
 * Ubah nomor Indonesia menjadi format wa.me (62…).
 * Menerima "0812…", "62812…", "+62 812-3456", "(0812) 3456".
 * Mengembalikan null bila nomornya tidak masuk akal.
 */
export function nomorWaInternasional(input: string | null | undefined): string | null {
  const digit = (input ?? '').replace(/\D/g, '')
  if (!digit) return null

  let n = digit
  if (n.startsWith('62')) {
    // sudah internasional
  } else if (n.startsWith('0')) {
    n = '62' + n.replace(/^0+/, '')
  } else if (n.startsWith('8')) {
    n = '62' + n
  } else {
    return null // kode negara lain / bukan nomor HP Indonesia
  }

  // 62 + 9..13 digit → total 11..15
  if (n.length < 11 || n.length > 15) return null
  return n
}

/**
 * Tautan WhatsApp. Bila nomor valid, pesan langsung menuju orang tersebut;
 * bila tidak, jatuh ke pemilih kontak agar tombolnya tetap berguna.
 */
export function waKe(nomor: string | null | undefined, pesan: string): string {
  const n = nomorWaInternasional(nomor)
  const teks = encodeURIComponent(pesan)
  return n ? `https://wa.me/${n}?text=${teks}` : `https://wa.me/?text=${teks}`
}

/** Halaman login khusus anggota tim (Kode Perusahaan + User ID). */
export const JALUR_LOGIN_TIM = '/tim/masuk'

/**
 * Pesan akun baru: Kode Perusahaan, User ID, password, dan tautan login tim.
 * Ketiganya wajib ada — tanpa Kode Perusahaan karyawan tidak bisa masuk.
 */
export function pesanAkunBaru(a: {
  nama: string; jabatan: string; username: string; kode: string
  password: string; origin: string; perusahaan?: string
}): string {
  return [
    `Halo ${a.nama}, berikut akun PropFS · Kontraktor AI Anda${a.perusahaan ? ` di ${a.perusahaan}` : ''}:`,
    '',
    `Jabatan        : ${a.jabatan}`,
    `Kode Perusahaan: ${a.kode}`,
    `User ID        : ${a.username}`,
    `Password       : ${a.password}`,
    '',
    `Login di       : ${a.origin}${JALUR_LOGIN_TIM}`,
    '',
    'Masukkan ketiga data di atas pada halaman login tim. Jangan bagikan data ini ke orang lain.',
  ].join('\n')
}

/**
 * Pesan pengingat untuk anggota lama. Password TIDAK disertakan karena tidak
 * pernah disimpan — karyawan diminta menghubungi admin untuk diatur ulang.
 */
export function pesanIngatkanAkun(a: {
  nama: string; jabatan: string; username: string; kode: string
  origin: string; perusahaan?: string
}): string {
  return [
    `Halo ${a.nama}, berikut pengingat akun PropFS · Kontraktor AI Anda${a.perusahaan ? ` di ${a.perusahaan}` : ''}:`,
    '',
    `Jabatan        : ${a.jabatan}`,
    `Kode Perusahaan: ${a.kode}`,
    `User ID        : ${a.username}`,
    '',
    `Login di       : ${a.origin}${JALUR_LOGIN_TIM}`,
    '',
    'Lupa password? Hubungi admin perusahaan Anda untuk mengatur ulang password.',
  ].join('\n')
}

/** Pesan setelah admin mengatur ulang password seorang anggota. */
export function pesanPasswordBaru(a: {
  nama: string; username: string; kode: string; password: string; origin: string
}): string {
  return [
    `Halo ${a.nama}, password akun PropFS · Kontraktor AI Anda sudah diatur ulang:`,
    '',
    `Kode Perusahaan: ${a.kode}`,
    `User ID        : ${a.username}`,
    `Password baru  : ${a.password}`,
    '',
    `Login di       : ${a.origin}${JALUR_LOGIN_TIM}`,
  ].join('\n')
}
