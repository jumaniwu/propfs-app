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
 * Penanda yang ditambahkan APK ke User-Agent. Nilainya ditetapkan di
 * capacitor.config.ts; kalau salah satu diubah, yang lain harus ikut.
 */
export const PENANDA_APK = 'PropFSApp'

/**
 * Apakah aplikasi sedang berjalan sebagai APK.
 *
 * DUA CARA, DAN URUTANNYA PENTING.
 *
 * 1. USER-AGENT. Inilah yang benar-benar bisa dipercaya. WebView menetapkannya
 *    sebelum satu byte pun diminta, berlaku di origin mana pun, dan terbaca
 *    serentak — tidak ada jendela waktu tempat jawabannya masih "belum tahu".
 *
 * 2. `window.Capacitor`. Cara bawaan Capacitor, dan cara yang DULU dipakai
 *    sendirian di sini. Ia gagal pada susunan aplikasi ini: objek itu
 *    disuntikkan lewat server lokal Capacitor, yang hanya melayani berkas dari
 *    `webDir`. Halaman kita datang dari https://propfs.id — origin lain sama
 *    sekali — jadi penyuntikannya tidak pernah sampai, atau sampai setelah
 *    React sudah memutuskan mau menampilkan apa. Yang terlihat di HP: APK
 *    terbuka di halaman jualan, seolah ia peramban biasa.
 *
 *    Tetap dipertahankan sebagai cadangan, untuk hari ketika aplikasinya
 *    dibundel ke dalam APK dan justru inilah yang tersedia.
 *
 * Tidak melempar dalam keadaan apa pun: seluruh keputusan tampilan bergantung
 * padanya, dan satu pengecualian di sini menjatuhkan halaman pertama.
 */
export function diAndroid(): boolean {
  try {
    const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent
    if (typeof ua === 'string' && ua.includes(PENANDA_APK)) return true
  } catch { /* jatuh ke cara kedua */ }

  try {
    const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return c?.isNativePlatform?.() === true
  } catch { return false }
}

/**
 * Apakah jembatan Capacitor SUNGGUH ada dan bisa dipanggil sekarang.
 *
 * Berbeda dari `diAndroid()`, dan bedanya itu yang menentukan.
 *
 *   `diAndroid()`  menjawab "apakah ini APK" — dari User-Agent, yang selalu
 *                  ada sejak byte pertama.
 *   fungsi ini     menjawab "apakah plugin native bisa dipanggil" — pertanyaan
 *                  yang berbeda, dan bisa dijawab TIDAK di dalam APK yang sah:
 *                  APK lama yang dibangun sebelum pluginnya ditambahkan, atau
 *                  WebView tua yang tidak mendukung penyuntikan skrip di awal
 *                  dokumen.
 *
 * Membedakannya penting karena akibat salah tebaknya diam: di WebView, tautan
 * `<a download>` TIDAK MELAKUKAN APA-APA dan tidak melaporkan apa pun. Kalau
 * jawabannya keliru, tombolnya cuma terlihat rusak.
 */
export function jembatanNativeAda(): boolean {
  try {
    const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return typeof c?.isNativePlatform === 'function' && c.isNativePlatform() === true
  } catch { return false }
}

/**
 * Ke mana sebuah berkas akhirnya disalurkan, dan kenapa ia gagal.
 *
 * Dibawa keluar apa adanya supaya pemanggilnya bisa mengatakan sesuatu yang
 * benar kepada pemakainya. Sebelum ini, seluruh kegagalan berakhir sebagai
 * `false` yang dibuang dengan `void` — dan itulah kenapa keluhannya berbunyi
 * "tombolnya ga bisa dipakai", bukan "muncul pesan galat".
 */
export type CaraSimpan = 'bagikan-native' | 'bagikan-web' | 'unduh-tautan'

export interface HasilSimpan {
  ok: boolean
  cara?: CaraSimpan
  /** Sudah berupa kalimat siap tampil, bukan pesan galat mesin. */
  alasan?: string
  /** Pemakainya menutup menu Bagikan — bukan kegagalan, jangan diberi pesan. */
  dibatalkan?: boolean
}

/**
 * Kalimat yang ditampilkan ketika sebuah berkas tidak bisa disimpan DI DALAM
 * APK. Menyebut jalan keluarnya, bukan cuma mengabarkan kegagalan.
 */
export const PESAN_APK_TAK_BISA =
  'Aplikasi ini belum bisa menyimpan berkas. Biasanya karena APK-nya versi lama — '
  + 'minta versi terbaru ke admin. Sementara itu, buka propfs.id lewat Chrome; '
  + 'di sana unduhannya jalan seperti biasa.'

/** Pemakainya membatalkan sendiri — dikenali agar tidak dilaporkan galat. */
function dibatalkanPemakai(e: unknown): boolean {
  const n = (e as { name?: string } | null)?.name
  const p = String((e as { message?: string } | null)?.message ?? '')
  return n === 'AbortError' || /abort|cancel|dibatalkan|share canceled/i.test(p)
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
async function bagikanDiAndroid(blob: Blob, nama: string, mime: string, teks?: string): Promise<void> {
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

  // `text` ikut dikirim bila ada: di Marcom, gambar dan captionnya memang satu
  // paket — dikirim terpisah berarti orangnya harus menyalin caption sendiri.
  await Share.share({ title: nama, files: [hasil.uri], ...(teks ? { text: teks } : {}) })
}

/** Menu Bagikan bawaan peramban. Ada di Chrome HP, TIDAK ADA di WebView. */
async function bagikanLewatPeramban(blob: Blob, nama: string, mime: string, teks?: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean
    share?: (d: ShareData) => Promise<void>
  }
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  const berkas = [new File([blob], nama, { type: mime })]
  if (!nav.canShare({ files: berkas })) return false
  await nav.share({ files: berkas, ...(teks ? { text: teks } : {}) })
  return true
}

/** Blob dari isi yang boleh Blob maupun base64. `null` bila memang kosong. */
function keBlob(isi: Blob | string | null | undefined, jenis: string): Blob | null {
  if (isi instanceof Blob) return isi.size === 0 ? null : isi
  const b64 = base64Saja(isi)
  if (!b64) return null
  try { return blobDariBase64(b64, jenis) } catch { return null }
}

/**
 * Simpan sebuah berkas, dan LAPORKAN apa yang terjadi.
 *
 * Urutannya ditentukan satu kenyataan: di WebView Android, `<a download>`
 * tidak mengunduh apa pun DAN tidak melempar apa pun. Jadi begitu kita tahu
 * sedang berada di dalam APK, jalur itu tidak boleh dipakai sebagai penutup —
 * ia bukan cadangan, ia lubang tempat berkasnya hilang tanpa suara.
 *
 *   DI APK   : plugin Capacitor → menu Bagikan peramban → MENYERAH DENGAN
 *              BERSUARA. Menyerah dengan bersuara jauh lebih berguna daripada
 *              "berhasil" yang tidak menghasilkan berkas apa pun.
 *   DI WEB   : `<a download>`, persis seperti sebelum modul ini ada. Tidak
 *              satu pun langkah baru disisipkan di sini — 21 titik pemanggil
 *              adalah pekerjaan yang dipakai setiap hari.
 *
 * Tidak pernah melempar.
 */
export async function simpanBerkasRinci(
  isi: Blob | string | null | undefined,
  nama: string,
  mime?: string,
  teks?: string,
): Promise<HasilSimpan> {
  const berkas = namaAman(nama)
  const jenis = mime || mimeDariNama(berkas)

  const blob = keBlob(isi, jenis)
  if (!blob) return { ok: false, alasan: 'Tidak ada isi berkas yang bisa disimpan.' }

  // ── Jalur web, tidak disentuh ────────────────────────────────────────────
  if (!diAndroid() && !jembatanNativeAda()) {
    try {
      unduhLewatTautan(blob, berkas)
      return { ok: true, cara: 'unduh-tautan' }
    } catch (e) {
      console.warn('[unduh] gagal mengunduh:', e)
      return { ok: false, alasan: 'Peramban ini menolak mengunduh berkasnya.' }
    }
  }

  // ── Di dalam APK ─────────────────────────────────────────────────────────
  try {
    await bagikanDiAndroid(blob, berkas, jenis, teks)
    return { ok: true, cara: 'bagikan-native' }
  } catch (e) {
    if (dibatalkanPemakai(e)) return { ok: false, dibatalkan: true }
    // Gagal berarti jembatannya memang tidak ada — dicatat sekali, lalu dicoba
    // cara berikutnya. Bukan alasan untuk berhenti.
    console.warn('[unduh] plugin native tidak tersedia:', e)
  }

  try {
    if (await bagikanLewatPeramban(blob, berkas, jenis, teks)) {
      return { ok: true, cara: 'bagikan-web' }
    }
  } catch (e) {
    if (dibatalkanPemakai(e)) return { ok: false, dibatalkan: true }
    console.warn('[unduh] menu bagikan peramban gagal:', e)
  }

  // Sengaja TIDAK jatuh ke `<a download>`. Di WebView ia tidak melakukan
  // apa-apa, dan mengembalikan `true` untuknya berarti berbohong kepada
  // pemakainya — persis kebohongan yang membuat tombolnya terasa rusak.
  return { ok: false, alasan: PESAN_APK_TAK_BISA }
}

/**
 * Bentuk ringkas untuk 21 titik pemanggil yang hanya perlu tahu berhasil atau
 * tidak. Kegagalannya dilaporkan sendiri lewat pelapor di bawah, jadi tidak
 * ada lagi tombol yang diam ketika gagal.
 */
export async function simpanBerkas(
  isi: Blob | string | null | undefined,
  nama: string,
  mime?: string,
): Promise<boolean> {
  const h = await simpanBerkasRinci(isi, nama, mime)
  if (!h.ok && !h.dibatalkan) laporkanGagal(h)
  return h.ok
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

  if (diAndroid() || jembatanNativeAda()) return await simpanBerkas(isi, berkas, jenis)

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

// ── Pelapor kegagalan ───────────────────────────────────────────────────────
//
// Modul ini sengaja tidak mengimpor toast: begitu React masuk ke sini, seluruh
// ujinya tidak bisa lagi dijalankan langsung di Node. Jadi penampilnya
// DISUNTIKKAN sekali dari App, dan modulnya tetap murni.
//
// Yang diperbaiki dengan ini bukan hal kecil. Sebelumnya setiap kegagalan
// berakhir sebagai `false` yang dibuang dengan `void` di 21 titik pemanggil —
// tombol ditekan, tidak terjadi apa-apa, tidak ada satu pun pesan. Sekarang
// satu sambungan membuat semuanya bersuara sekaligus.

type Pelapor = (pesan: string) => void
let pelapor: Pelapor | null = null

/** Dipasang sekali saat aplikasi mulai. */
export function pasangPelaporUnduh(fn: Pelapor | null): void {
  pelapor = fn
}

function laporkanGagal(h: HasilSimpan): void {
  const pesan = h.alasan || PESAN_APK_TAK_BISA
  try { pelapor?.(pesan) } catch { /* penampilnya rusak; jangan ikut menjatuhkan */ }
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
