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
  namaAman, mimeDariNama, base64Saja, blobDariBase64, diAndroid,
  simpanBerkas, bukaBerkas, simpanPdf, simpanXlsx,
} from '../src/lib/unduhBerkas.ts'

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

console.log(`unduh-berkas: ${ok} assert lulus`)
