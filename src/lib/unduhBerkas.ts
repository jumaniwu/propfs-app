// ============================================================
// PropFS — SATU pintu untuk semua unduhan berkas
//
// Kenapa ini ada:
//
// WebView Android TIDAK mengunduh apa pun dari `blob:` maupun `data:`.
// `DownloadListener` Android hanya menyala untuk navigasi http(s) yang membawa
// Content-Disposition — sedangkan seluruh ekspor aplikasi ini (PDF kwitansi,
// PDF PO, PDF SPK, laporan Excel, PNG render, DXF siteplan) dibuat di dalam
// peramban dan diunduh lewat `<a download>` ke sebuah Blob.
//
// Akibatnya di dalam APK: tombol ditekan, tidak terjadi apa-apa, dan tidak ada
// satu pun pesan galat. Bukan fitur yang hilang — fitur yang tampak rusak.
//
// Jadi seluruh unduhan dialirkan ke sini, dan HANYA di sini yang tahu bedanya
// web dan Android:
//
//   - Di WEB   : persis seperti sebelumnya — createObjectURL + <a download>.
//                Perilakunya tidak boleh berubah sedikit pun; 21 titik
//                pemanggil adalah pekerjaan yang dipakai setiap hari.
//   - Di ANDROID: berkas ditulis ke cache aplikasi, lalu menu Bagikan Android
//                dibuka — sehingga kwitansi bisa langsung dikirim ke WhatsApp
//                konsumen tanpa mampir ke aplikasi Files.
//
// `@capacitor/filesystem` dan `@capacitor/share` diimpor DINAMIS di dalam
// cabang native saja, jadi bundel web tidak pernah memuatnya.
// ============================================================

/** Mime bawaan dari akhiran nama berkas. */
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  dxf: 'application/dxf',
  json: 'application/json',
  csv: 'text/csv',
  txt: 'text/plain',
}

/**
 * Nama berkas yang aman disimpan.
 *
 * Nama datang dari nomor dokumen dan nama proyek — keduanya diketik orang.
 * Garis miring di dalamnya membuat berkas tersimpan di tempat yang tidak
 * diduga (atau gagal sama sekali di Android), dan nama kosong menghasilkan
 * berkas tanpa nama yang tidak bisa dibuka dengan ketukan.
 */
export function namaAman(nama: unknown, cadangan = 'berkas'): string {
  const s = String(nama ?? '').trim()
    .replace(/[\\/:*?"<>|]+/g, '-')   // terlarang di Android maupun Windows
    .replace(/\s+/g, ' ')
    .replace(/^[-.\s]+|[-\s]+$/g, '')
  return s || cadangan
}

/** Mime dari nama berkasnya; `application/octet-stream` bila tak dikenali. */
export function mimeDariNama(nama: unknown): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(nama ?? '').trim())
  return (m && MIME[m[1].toLowerCase()]) || 'application/octet-stream'
}

/** Base64 telanjang dari data yang mungkin sudah berupa data URI. */
export function base64Saja(data: unknown): string {
  const s = String(data ?? '').trim()
  if (!s) return ''
  return /^data:/i.test(s) ? s.slice(s.indexOf(',') + 1) : s
}

/** Base64 → Blob, tanpa melewati data URI yang panjangnya bisa ditolak. */
export function blobDariBase64(data: string, mime: string): Blob {
  const biner = atob(base64Saja(data))
  const buf = new Uint8Array(biner.length)
  for (let i = 0; i < biner.length; i++) buf[i] = biner.charCodeAt(i)
  return new Blob([buf], { type: mime })
}

async function blobKeBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  // Dipotong-potong: `String.fromCharCode(...buf)` pada berkas beberapa MB
  // melebihi batas argumen dan melempar RangeError.
  for (let i = 0; i < buf.length; i += 0x8000) {
    s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

/**
 * Apakah aplikasi sedang berjalan sebagai APK.
 *
 * Dibaca dari `window.Capacitor` langsung, bukan lewat `import` dari
 * `@capacitor/core` — supaya modul ini tetap murni dan bisa diuji di Node,
 * dan supaya bundel web tidak menyeret satu paket pun untuk menjawab
 * pertanyaan yang jawabannya selalu "tidak".
 */
export function diAndroid(): boolean {
  try {
    const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return c?.isNativePlatform?.() === true
  } catch { return false }
}

/** Jalur web: persis seperti seluruh kode sebelum modul ini ada. */
function unduhLewatTautan(blob: Blob, nama: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nama
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Dicabut belakangan: mencabutnya seketika membatalkan unduhan yang baru
  // saja dimulai pada sebagian peramban.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Tulis ke cache aplikasi lalu buka menu Bagikan Android. */
async function bagikanDiAndroid(blob: Blob, nama: string, mime: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  const hasil = await Filesystem.writeFile({
    path: nama,
    data: await blobKeBase64(blob),
    // Cache, bukan Documents: berkas ini hasil cetakan yang bisa dibuat ulang
    // kapan saja, dan menumpuknya di penyimpanan pemakai tanpa ada yang
    // membersihkan adalah cara aplikasi memenuhi memori orang diam-diam.
    directory: Directory.Cache,
    recursive: true,
  })

  await Share.share({ title: nama, files: [hasil.uri] })
}

/**
 * Simpan sebuah berkas — di web mengunduh, di Android membuka menu Bagikan.
 *
 * `isi` boleh Blob atau base64 (dengan atau tanpa awalan data URI).
 * Tidak pernah melempar: gagal menyimpan tidak boleh menjatuhkan halaman yang
 * sedang dipakai. Mengembalikan `false` bila memang tidak ada yang disimpan.
 */
export async function simpanBerkas(
  isi: Blob | string | null | undefined,
  nama: string,
  mime?: string,
): Promise<boolean> {
  const berkas = namaAman(nama)
  const jenis = mime || mimeDariNama(berkas)

  let blob: Blob
  if (isi instanceof Blob) {
    if (isi.size === 0) return false
    blob = isi
  } else {
    const b64 = base64Saja(isi)
    if (!b64) return false
    try { blob = blobDariBase64(b64, jenis) } catch { return false }
  }

  try {
    if (diAndroid()) await bagikanDiAndroid(blob, berkas, jenis)
    else unduhLewatTautan(blob, berkas)
    return true
  } catch (e) {
    console.warn('[unduh] gagal menyimpan berkas:', e)
    return false
  }
}

/**
 * Buka berkas untuk DILIHAT, bukan disimpan.
 *
 * Di web: tab baru. Di Android: menu Bagikan juga — "buka dengan" ada di
 * dalamnya, dan itu satu-satunya cara membuka PDF tanpa memaketkan pembaca
 * PDF sendiri ke dalam APK.
 */
export async function bukaBerkas(
  isi: Blob | string | null | undefined,
  nama: string,
  mime?: string,
): Promise<boolean> {
  const berkas = namaAman(nama)
  const jenis = mime || mimeDariNama(berkas)

  if (diAndroid()) return await simpanBerkas(isi, berkas, jenis)

  let blob: Blob
  if (isi instanceof Blob) {
    if (isi.size === 0) return false
    blob = isi
  } else {
    const b64 = base64Saja(isi)
    if (!b64) return false
    try { blob = blobDariBase64(b64, jenis) } catch { return false }
  }

  try {
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    // Dibebaskan belakangan: mencabutnya seketika membuat tab yang baru
    // dibuka menampilkan halaman kosong.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch (e) {
    console.warn('[unduh] gagal membuka berkas:', e)
    return false
  }
}

// ── Pembungkus tipis untuk dua bentuk yang paling sering dipakai ────────────

/** Bentuk minimal jsPDF yang dipakai di sini — supaya modul ini tidak
 *  mengimpor jspdf, yang beratnya ratusan kilobyte. */
interface DokumenPdf { output(jenis: 'blob'): Blob }

/** Unduh dokumen jsPDF. Pengganti `doc.save(nama)`. */
export async function simpanPdf(doc: DokumenPdf, nama: string): Promise<boolean> {
  const berkas = namaAman(nama).toLowerCase().endsWith('.pdf')
    ? namaAman(nama) : `${namaAman(nama, 'dokumen')}.pdf`
  try {
    return await simpanBerkas(doc.output('blob'), berkas, 'application/pdf')
  } catch (e) {
    console.warn('[unduh] gagal membuat PDF:', e)
    return false
  }
}

/** Unduh workbook Excel dari larik byte hasil `write(wb, { type: 'array' })`. */
export async function simpanXlsx(data: ArrayBuffer | Uint8Array<ArrayBufferLike>, nama: string): Promise<boolean> {
  const berkas = namaAman(nama).toLowerCase().endsWith('.xlsx')
    ? namaAman(nama) : `${namaAman(nama, 'laporan')}.xlsx`
  // Disalin ke ArrayBuffer polos: `Uint8Array<ArrayBufferLike>` bisa berdiri
  // di atas SharedArrayBuffer, yang bukan BlobPart yang sah.
  const buf = data instanceof Uint8Array
    ? data.slice().buffer as ArrayBuffer
    : data
  return await simpanBerkas(new Blob([buf]), berkas, MIME.xlsx)
}
