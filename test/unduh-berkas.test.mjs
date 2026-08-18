// ============================================================
// Satu pintu unduhan berkas.
//
// Modul ini menggantikan 21 titik unduhan yang dipakai setiap hari — PDF
// kwitansi, PDF PO, PDF SPK, enam laporan Excel, render PNG, DXF siteplan.
// Jadi yang diuji bukan hanya "jalannya benar", melainkan bahwa ia TIDAK
// PERNAH melempar: satu pengecualian di sini menjatuhkan halaman yang sedang
// dipakai orang, pada saat mereka menekan tombol cetak.
//
// Yang juga dijaga: nama berkas. Nama datang dari nomor dokumen (`KW/2026/
// 08/0001`) dan nama proyek — keduanya diketik orang, keduanya bisa memuat
// garis miring. Di Android, nama bergaris miring GAGAL disimpan, bukan
// disimpan di tempat lain.
// ============================================================
import {
  namaAman, mimeDariNama, base64Saja, blobDariBase64, diAndroid, PENANDA_APK,
  simpanBerkas, bukaBerkas, simpanPdf, simpanXlsx,
  jembatanNativeAda, simpanBerkasRinci, pasangPelaporUnduh, PESAN_APK_TAK_BISA,
} from '../src/lib/unduhBerkas.ts'

// Berkas uji ini SENGAJA menjalankan jalur-jalur yang gagal — itu memang
// intinya. Peringatannya dibungkam agar kegagalan uji yang sesungguhnya tidak
// tenggelam di antara belasan tumpukan galat yang justru diharapkan muncul.
console.warn = () => {}

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Nama berkas ─────────────────────────────────────────────────────────
assert(namaAman('KW/2026/08/0001.pdf') === 'KW-2026-08-0001.pdf',
  'garis miring nomor kwitansi diganti, bukan jadi folder')
assert(namaAman('PO\\007\\2026.pdf') === 'PO-007-2026.pdf', 'garis miring balik juga')
assert(!namaAman('a:b*c?d"e<f>g|h').match(/[\\/:*?"<>|]/),
  'seluruh karakter terlarang Android & Windows dibuang')
assert(namaAman('  Laporan   Akuntan  .xlsx') === 'Laporan Akuntan .xlsx',
  'spasi berlebih dirapikan')
assert(namaAman('') === 'berkas', 'nama kosong tetap punya nama')
assert(namaAman('   ') === 'berkas', 'spasi saja dianggap kosong')
assert(namaAman(null) === 'berkas', 'null aman')
assert(namaAman(undefined) === 'berkas', 'undefined aman')
assert(namaAman('///') === 'berkas', 'yang habis dibersihkan jatuh ke cadangan')
assert(namaAman('', 'laporan') === 'laporan', 'cadangan bisa ditentukan')
// Jalur relatif tidak boleh tersisa sebagai jalur.
const jahat = namaAman('../../etc/passwd')
assert(!jahat.includes('/') && !jahat.includes('..\\'), `tanpa pemisah jalur: ${jahat}`)

// ── 2. Mime ────────────────────────────────────────────────────────────────
assert(mimeDariNama('a.pdf') === 'application/pdf', 'pdf')
assert(mimeDariNama('a.PDF') === 'application/pdf', 'huruf besar tetap dikenali')
assert(mimeDariNama('Laporan.xlsx').includes('spreadsheetml'), 'xlsx')
assert(mimeDariNama('render.png') === 'image/png', 'png')
assert(mimeDariNama('siteplan.dxf') === 'application/dxf', 'dxf')
assert(mimeDariNama('data.json') === 'application/json', 'json')
assert(mimeDariNama('tanpa-akhiran') === 'application/octet-stream', 'yang tak dikenal')
assert(mimeDariNama('') === 'application/octet-stream', 'kosong aman')
assert(mimeDariNama(null) === 'application/octet-stream', 'null aman')

// ── 3. Base64 ──────────────────────────────────────────────────────────────
assert(base64Saja('data:application/pdf;base64,QUJD') === 'QUJD', 'awalan data URI dibuang')
assert(base64Saja('QUJD') === 'QUJD', 'base64 telanjang dibiarkan')
assert(base64Saja('') === '', 'kosong')
assert(base64Saja(null) === '', 'null aman')
assert(base64Saja('  QUJD  ') === 'QUJD', 'spasi dipangkas')

// ── 4. diAndroid: harus false di mana pun kecuali di dalam APK ─────────────
//
// Ini gerbang yang menentukan seluruh perilaku modul. Kalau ia keliru bernilai
// true di web, setiap unduhan akan mencoba memanggil plugin Capacitor yang
// tidak ada — dan seluruh ekspor mati sekaligus.
assert(diAndroid() === false, 'di Node (dan di web) selalu false')
globalThis.Capacitor = {}
assert(diAndroid() === false, 'objek Capacitor tanpa isNativePlatform: tetap false')
globalThis.Capacitor = { isNativePlatform: () => false }
assert(diAndroid() === false, 'isNativePlatform false')
globalThis.Capacitor = { isNativePlatform: () => 'ya' }
assert(diAndroid() === false, 'nilai selain true tidak lolos')
globalThis.Capacitor = { isNativePlatform: () => { throw new Error('rusak') } }
assert(diAndroid() === false, 'plugin yang melempar tidak menjatuhkan apa pun')
globalThis.Capacitor = { isNativePlatform: () => true }
assert(diAndroid() === true, 'di dalam APK barulah true')
delete globalThis.Capacitor

// ── 4b. Penanda User-Agent: jalan yang sebenarnya dipakai APK ──────────────
//
// `window.Capacitor` GAGAL pada susunan aplikasi ini. Objek itu disuntikkan
// lewat server lokal Capacitor, yang hanya melayani berkas dari `webDir` —
// sedangkan halaman kita datang dari https://propfs.id, origin lain sama
// sekali. Yang terlihat di HP: APK terbuka di halaman jualan, seolah peramban.
//
// User-Agent tidak punya masalah itu: WebView menetapkannya sebelum satu byte
// pun diminta (Bridge.java memanggil setUserAgentString saat menyiapkan
// WebSettings), jadi ia terbaca serentak di origin mana pun.
{
  // `globalThis.navigator` di Node 22 hanya punya getter, jadi tidak bisa
  // ditimpa dengan penetapan biasa.
  const asli = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const ganti = nav => Object.defineProperty(globalThis, 'navigator', {
    value: nav, configurable: true, writable: true,
  })
  const pasang = ua => ganti({ userAgent: ua })

  pasang(`Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 ${PENANDA_APK}`)
  assert(diAndroid() === true, 'UA dengan penanda: true, tanpa perlu window.Capacitor')
  assert(globalThis.Capacitor === undefined, 'dan memang tidak ada window.Capacitor di sini')

  // UA Android biasa TANPA penanda — Chrome di HP yang sama.
  pasang('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36')
  assert(diAndroid() === false, 'Chrome Android biasa tetap false')

  pasang('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0.0.0 Safari/537.36')
  assert(diAndroid() === false, 'desktop false')

  // Penandanya harus utuh; potongan namanya bukan penanda.
  pasang('Mozilla/5.0 PropFS')
  assert(diAndroid() === false, '"PropFS" saja bukan penanda APK')
  pasang('Mozilla/5.0 propfsapp')
  assert(diAndroid() === false, 'huruf kecil bukan penanda — ia ditulis persis oleh config')

  // navigator rusak/absen tidak boleh menjatuhkan apa pun.
  ganti(undefined)
  assert(diAndroid() === false, 'tanpa navigator: false, bukan melempar')
  ganti({})
  assert(diAndroid() === false, 'navigator tanpa userAgent aman')
  ganti({ get userAgent() { throw new Error('rusak') } })
  assert(diAndroid() === false, 'userAgent yang melempar ditangkap')

  // Cadangan tetap hidup: bila UA-nya polos tetapi bridge-nya ada.
  pasang('Mozilla/5.0')
  globalThis.Capacitor = { isNativePlatform: () => true }
  assert(diAndroid() === true, 'cadangan window.Capacitor tetap dipakai')
  delete globalThis.Capacitor

  if (asli) Object.defineProperty(globalThis, 'navigator', asli)
  else delete globalThis.navigator
}

// ── 5. simpanBerkas: TIDAK PERNAH melempar ─────────────────────────────────
//
// Node tidak punya DOM, jadi jalur webnya pasti gagal di sini. Yang diuji
// justru itu: gagal harus mengembalikan false, bukan melempar.
{
  const hasil = []
  for (const isi of [null, undefined, '', '   ', 'bukan base64!!!']) {
    hasil.push(await simpanBerkas(isi, 'a.pdf'))
  }
  assert(hasil.every(h => h === false), 'masukan kosong/rusak mengembalikan false')

  // Blob kosong bukan berkas.
  assert(await simpanBerkas(new Blob([]), 'a.pdf') === false, 'blob kosong ditolak')
  assert(await bukaBerkas(null, 'a.pdf') === false, 'bukaBerkas dengan null aman')
  assert(await bukaBerkas('', 'a.pdf') === false, 'bukaBerkas dengan kosong aman')
}

// ── 6. simpanPdf: nama selalu berakhiran .pdf ──────────────────────────────
{
  // Dokumen tiruan berbentuk jsPDF: yang dipakai hanya `output('blob')`.
  const dokumen = { output: () => new Blob(['%PDF-1.4']) }
  const nama = []
  const asli = globalThis.document
  // Tanpa DOM, simpanBerkas akan gagal dan mengembalikan false — cukup untuk
  // membuktikan tidak melempar. Nama berkasnya diuji terpisah lewat namaAman.
  assert(await simpanPdf(dokumen, 'KW/2026/08/0001') === false,
    'tanpa DOM mengembalikan false, bukan melempar')
  globalThis.document = asli
  void nama

  // Dokumen yang output-nya melempar (jsPDF rusak) juga tidak boleh menular.
  const rusak = { output: () => { throw new Error('jspdf gagal') } }
  assert(await simpanPdf(rusak, 'a') === false, 'jsPDF yang melempar ditangkap')
}

// ── 7. simpanXlsx ──────────────────────────────────────────────────────────
{
  assert(await simpanXlsx(new Uint8Array([1, 2, 3]), 'Laporan') === false,
    'tanpa DOM mengembalikan false, bukan melempar')
  assert(await simpanXlsx(new ArrayBuffer(8), 'Laporan.xlsx') === false, 'ArrayBuffer diterima')
}

// ── 8. blobDariBase64 ──────────────────────────────────────────────────────
{
  const b = blobDariBase64('QUJD', 'text/plain')  // "ABC"
  assert(b.size === 3, 'tiga byte')
  assert(b.type === 'text/plain', 'mime terpasang')
  assert(await b.text() === 'ABC', 'isinya benar')

  const dariUri = blobDariBase64('data:text/plain;base64,QUJD', 'text/plain')
  assert(await dariUri.text() === 'ABC', 'data URI juga terbaca')

  let melempar = false
  try { blobDariBase64('bukan base64!!!', 'text/plain') } catch { melempar = true }
  assert(melempar, 'base64 rusak memang melempar di sini — simpanBerkas yang menangkapnya')
}


// ── 9. jembatanNativeAda: pertanyaan yang BERBEDA dari diAndroid ───────────
//
// `diAndroid()` menjawab "apakah ini APK", `jembatanNativeAda()` menjawab
// "apakah plugin native bisa dipanggil". Keduanya bisa berbeda di dalam APK
// yang sah — APK lama yang dibangun sebelum pluginnya ada — dan justru
// perbedaan itulah yang menentukan berkasnya tersimpan atau hilang diam-diam.
{
  delete globalThis.Capacitor
  assert(jembatanNativeAda() === false, 'tanpa window.Capacitor: false')

  globalThis.Capacitor = {}
  assert(jembatanNativeAda() === false, 'objek kosong bukan jembatan')

  globalThis.Capacitor = { isNativePlatform: 'bukan fungsi' }
  assert(jembatanNativeAda() === false, 'yang bukan fungsi tidak dipanggil')

  globalThis.Capacitor = { isNativePlatform: () => false }
  assert(jembatanNativeAda() === false, 'di web Capacitor menjawab false')

  globalThis.Capacitor = { isNativePlatform: () => 'ya' }
  assert(jembatanNativeAda() === false, 'hanya `true` yang dihitung, bukan yang mirip')

  globalThis.Capacitor = { isNativePlatform: () => { throw new Error('rusak') } }
  assert(jembatanNativeAda() === false, 'yang melempar ditangkap')

  globalThis.Capacitor = { isNativePlatform: () => true }
  assert(jembatanNativeAda() === true, 'jembatan sungguhan: true')

  delete globalThis.Capacitor
}

// ── 10. DI APK, KEGAGALAN TIDAK BOLEH MENYAMAR SEBAGAI KEBERHASILAN ───────
//
// Inti keluhannya: "appnya ga bisa download foto dan tombol share ga bisa
// pakai". Penyebabnya satu kenyataan yang tidak bisa dilihat dari kode
// pemanggil — di WebView Android, `<a download>` TIDAK mengunduh apa pun DAN
// TIDAK melempar apa pun. Capacitor sendiri tidak memasang DownloadListener.
//
// Jadi begitu kita tahu sedang di dalam APK, jalur itu haram dipakai sebagai
// penutup: `true` untuknya adalah kebohongan yang membuat orang berhenti
// mencari berkas yang tidak pernah ada.
{
  const asli = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const ganti = nav => Object.defineProperty(globalThis, 'navigator', {
    value: nav, configurable: true, writable: true,
  })

  // APK: penanda di UA, tanpa jembatan native, tanpa navigator.share.
  ganti({ userAgent: `Mozilla/5.0 (Linux; Android 14) Chrome/126.0.0.0 Mobile Safari/537.36 ${PENANDA_APK}` })
  delete globalThis.Capacitor

  const h = await simpanBerkasRinci(new Blob(['isi']), 'promosi.png', 'image/png')
  assert(h.ok === false, 'di APK tanpa jembatan: TIDAK mengaku berhasil')
  assert(h.cara === undefined, 'dan tidak mengaku memakai jalur mana pun')
  assert(h.alasan === PESAN_APK_TAK_BISA, 'alasannya kalimat siap tampil, bukan galat mesin')
  assert(/APK|Chrome/i.test(h.alasan), 'menyebut jalan keluarnya, bukan cuma kabar gagal')

  // Kegagalan itu BERSUARA — inilah yang dulu tidak ada.
  const suara = []
  pasangPelaporUnduh(p => suara.push(p))
  const berhasil = await simpanBerkas(new Blob(['isi']), 'promosi.png', 'image/png')
  assert(berhasil === false, 'simpanBerkas tetap mengembalikan false')
  assert(suara.length === 1, 'dan melaporkannya SATU kali')
  assert(suara[0] === PESAN_APK_TAK_BISA, 'dengan kalimat yang sama')

  // Pelapor yang rusak tidak boleh menjatuhkan halaman yang sedang dipakai.
  pasangPelaporUnduh(() => { throw new Error('toast rusak') })
  assert(await simpanBerkas(new Blob(['isi']), 'a.png') === false, 'pelapor rusak ditangkap')

  // Dibatalkan pemakainya BUKAN kegagalan — tidak boleh ada pesan galat.
  suara.length = 0
  pasangPelaporUnduh(p => suara.push(p))
  globalThis.Capacitor = { isNativePlatform: () => true }
  ganti({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36',
    canShare: () => true,
    share: () => { const e = new Error('Abort due to cancellation of share.'); e.name = 'AbortError'; throw e },
  })
  const batal = await simpanBerkasRinci(new Blob(['isi']), 'a.png', 'image/png')
  assert(batal.ok === false, 'dibatalkan: bukan berhasil')
  assert(batal.dibatalkan === true, 'ditandai sebagai pembatalan')
  await simpanBerkas(new Blob(['isi']), 'a.png', 'image/png')
  assert(suara.length === 0, 'pembatalan TIDAK memunculkan pesan galat')

  // Menu bagikan peramban dipakai bila ada — Chrome HP punya, WebView tidak.
  const dibagikan = []
  ganti({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36',
    canShare: () => true,
    share: async d => { dibagikan.push(d) },
  })
  const lewatWeb = await simpanBerkasRinci(new Blob(['isi']), 'promosi.png', 'image/png', 'Caption')
  assert(lewatWeb.ok === true && lewatWeb.cara === 'bagikan-web', 'jatuh ke menu bagikan peramban')
  assert(dibagikan[0].files[0].name === 'promosi.png', 'berkasnya ikut, dengan namanya')
  assert(dibagikan[0].text === 'Caption', 'caption ikut dikirim — di Marcom keduanya satu paket')

  pasangPelaporUnduh(null)
  delete globalThis.Capacitor
  if (asli) Object.defineProperty(globalThis, 'navigator', asli)
  else delete globalThis.navigator
}

// ── 11. Di WEB tidak ada satu pun yang berubah ────────────────────────────
//
// 21 titik pemanggil adalah pekerjaan yang dipakai setiap hari. Jalur webnya
// harus tetap `<a download>` — tanpa langkah baru yang disisipkan di depannya,
// termasuk navigator.share yang akan memunculkan menu yang tidak diminta.
{
  const asliNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const asliDoc = globalThis.document
  delete globalThis.Capacitor
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0.0.0 Safari/537.36',
      // Sengaja DISEDIAKAN: kalau jalur web diam-diam memakainya, uji ini gagal.
      canShare: () => true,
      share: async () => { throw new Error('menu bagikan tidak boleh dipakai di web') },
    },
    configurable: true, writable: true,
  })

  const diklik = []
  const anchor = { set href(v) { this._h = v }, get href() { return this._h },
    download: '', click() { diklik.push(this.download) }, remove() {} }
  globalThis.document = {
    createElement: () => anchor,
    body: { appendChild() {} },
  }
  globalThis.URL.createObjectURL = () => 'blob:uji'
  globalThis.URL.revokeObjectURL = () => {}

  const h = await simpanBerkasRinci(new Blob(['isi']), 'Laporan Mingguan.xlsx')
  assert(h.ok === true, 'di web tetap berhasil')
  assert(h.cara === 'unduh-tautan', 'dan tetap lewat <a download>, bukan menu bagikan')
  assert(diklik.length === 1 && diklik[0] === 'Laporan Mingguan.xlsx', 'nama berkasnya utuh')

  globalThis.document = asliDoc
  if (asliNav) Object.defineProperty(globalThis, 'navigator', asliNav)
  else delete globalThis.navigator
}

console.log(`unduh-berkas: ${ok} assert lulus`)
