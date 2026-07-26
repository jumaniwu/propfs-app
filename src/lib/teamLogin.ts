// ============================================================
// PropFS — Login Tim: Kode Perusahaan + User ID (logika murni, tanpa DOM)
//
// Anggota tim TIDAK memakai email pribadinya untuk login. Kombinasi
// Kode Perusahaan + username dipetakan ke satu email internal:
//     budi + PFS-4K7M  →  budi@pfs-4k7m.tim.propfs.id
// Email internal ini tidak pernah dipakai berkirim surat; fungsinya hanya
// sebagai identitas unik di auth.users, supaya akun kerja seorang karyawan
// tidak bercampur dengan akun PropFS pribadinya.
// ============================================================

/** Domain email internal akun tim. Tidak menerima/mengirim email. */
export const DOMAIN_TIM = 'tim.propfs.id'

/** Awalan kode perusahaan; harus sama dengan buat_kode_perusahaan() di SQL. */
export const AWALAN_KODE = 'PFS-'

/**
 * Rapikan kode perusahaan yang diketik pengguna.
 * Menerima "pfs4k7m", "pfs 4k7m", "PFS-4K7M", " pfs-4k7m " → "PFS-4K7M".
 * Awalan PFS boleh tidak diketik: "4k7m" → "PFS-4K7M".
 */
export function normalKode(input: string | null | undefined): string {
  const bersih = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!bersih) return ''
  const inti = bersih.startsWith('PFS') ? bersih.slice(3) : bersih
  return inti ? AWALAN_KODE + inti : ''
}

/** Kode yang sah: PFS- diikuti 4 karakter dari alfabet tanpa huruf ambigu. */
export function kodeValid(input: string | null | undefined): boolean {
  return /^PFS-[2-9A-HJ-NP-Z]{4}$/.test(normalKode(input))
}

/**
 * Rapikan username. Huruf kecil, angka, titik, strip, dan garis bawah.
 * Spasi menjadi titik agar "budi santoso" tetap bisa dipakai.
 */
export function normalUsername(input: string | null | undefined): string {
  return (input ?? '')
    .trim().toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    // titik di ujung membuat bagian lokal email menjadi tidak sah
    .replace(/^[._-]+/, '')
    .slice(0, 24)
    .replace(/[._-]+$/, '')
}

/** Username sah: 3–24 karakter, diawali dan diakhiri huruf/angka. */
export function usernameValid(input: string | null | undefined): boolean {
  const u = normalUsername(input)
  return u.length >= 3 && /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(u)
}

/**
 * Email internal untuk sebuah (username, kode). Mengembalikan string kosong
 * bila salah satunya tidak sah, supaya pemanggil tidak pernah mengirim
 * alamat setengah jadi ke Supabase.
 */
export function emailInternal(
  username: string | null | undefined, kode: string | null | undefined,
): string {
  if (!usernameValid(username) || !kodeValid(kode)) return ''
  return `${normalUsername(username)}@${normalKode(kode).toLowerCase()}.${DOMAIN_TIM}`
}

/** Kebalikan emailInternal(); null bila bukan email akun tim. */
export function bacaEmailInternal(email: string | null | undefined): {
  username: string; kode: string
} | null {
  const m = /^([a-z0-9][a-z0-9._-]*)@(pfs-[2-9a-hj-np-z]{4})\.(.+)$/i.exec((email ?? '').trim())
  if (!m || m[3].toLowerCase() !== DOMAIN_TIM) return null
  return { username: m[1].toLowerCase(), kode: m[2].toUpperCase() }
}

/** Apakah akun ini akun tim (bukan akun PropFS pribadi). */
export function akunTim(email: string | null | undefined): boolean {
  return bacaEmailInternal(email) !== null
}

// ── Hak akses Kontraktor AI yang menumpang langganan perusahaan ─────────────

export interface PaketWorkspace {
  owner_plan?: string | null
  owner_plan_expires?: string | null
  owner_trial_expires?: string | null
}

/**
 * Anggota tim tidak punya langganan sendiri — aksesnya mengikuti langganan
 * Kontraktor AI milik perusahaan. Dianggap masih berlaku bila paketnya bukan
 * `free` dan belum lewat tanggal, atau masa uji coba perusahaan masih jalan.
 * Tanggal kosong diartikan "tanpa batas", bukan "sudah lewat", supaya
 * perusahaan yang paketnya diatur manual di backend tidak ikut terkunci.
 */
export function aksesLewatPerusahaan(ws: PaketWorkspace | null | undefined, sekarang = new Date()): boolean {
  if (!ws) return false
  const belumLewat = (iso: string | null | undefined) =>
    !iso ? true : new Date(iso).getTime() > sekarang.getTime()

  const paket = (ws.owner_plan ?? 'free').toLowerCase()
  if (paket && paket !== 'free' && belumLewat(ws.owner_plan_expires)) return true

  // masa uji coba perusahaan — hanya berlaku bila tanggalnya memang ada
  const trial = ws.owner_trial_expires
  return !!trial && new Date(trial).getTime() > sekarang.getTime()
}
