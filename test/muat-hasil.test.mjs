// ============================================================
// Kenapa halaman hasil FS berputar terus.
//
// `/result/:id` memuat proyeknya di dalam sebuah `async function init()` yang
// TIDAK punya satu pun penanganan galat, dan `setReady(true)` ada di baris
// terakhirnya. Apa pun yang melempar di tengah jalan — sesi kedaluwarsa,
// jaringan putus, RLS menolak — membuat baris itu tidak pernah tercapai. Yang
// terlihat pemakai hanya lingkaran berputar, selamanya, tanpa keterangan.
//
// Bentuk kedua lebih licik: permintaan yang TIDAK melempar dan TIDAK selesai.
// Di ponsel yang berpindah dari 5G ke tanpa sinyal, `fetch` bisa menggantung
// tanpa batas — tidak ada galat untuk ditangkap, hanya janji yang tidak pernah
// ditepati. `try/catch` sekalipun tidak akan pernah dijalankan.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  denganBatasWaktu, keadaanMuat, pesanGalatMuat, perluMasukUlang,
  BATAS_MUAT_MS, PESAN_LAMBAT, pesanTunggu,
} from '../src/lib/muatHasil.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Janji yang menggantung akhirnya menyerah ──────────────────────
//
// Inilah bentuk kegagalan yang tidak bisa ditangkap try/catch, karena memang
// tidak ada yang dilempar.
{
  const menggantung = new Promise(() => { /* tidak pernah selesai */ })
  let pesan = ''
  try { await denganBatasWaktu(menggantung, 30) } catch (e) { pesan = e.message }
  assert(pesan === PESAN_LAMBAT, 'menyerah dengan pesan yang bisa dibaca')
  assert(/sinyal/i.test(pesan), 'menyebut kemungkinan sebabnya')
  assert(/muat ulang/i.test(pesan), 'dan apa yang bisa dilakukan')
}

// ── 2. Yang selesai tepat waktu lewat apa adanya ────────────────────
{
  assert(await denganBatasWaktu(Promise.resolve('data'), 200) === 'data', 'nilai diteruskan')

  let kena = ''
  try { await denganBatasWaktu(Promise.reject(new Error('RLS menolak')), 200) }
  catch (e) { kena = e.message }
  assert(kena === 'RLS menolak', 'galat aslinya diteruskan, tidak ditelan')
}

// ── 3. Pengatur waktunya dibersihkan ────────────────────────────────
//
// Tanpa ini, setiap pembukaan halaman meninggalkan satu timer hidup — dan pada
// halaman yang dibuka-tutup berkali-kali, timer-timer itu menumpuk. Diuji
// lewat akibatnya: proses Node keluar sendiri kalau tidak ada timer tersisa.
{
  const sebelum = process.getActiveResourcesInfo?.().filter(r => r === 'Timeout').length ?? 0
  await denganBatasWaktu(Promise.resolve(1), 60_000)
  const sesudah = process.getActiveResourcesInfo?.().filter(r => r === 'Timeout').length ?? 0
  assert(sesudah <= sebelum, 'tidak ada timer 60 detik yang tertinggal hidup')
}

// ── 4. Batas waktunya masuk akal untuk sinyal lapangan ─────────────
{
  assert(BATAS_MUAT_MS >= 6000,
    'jangan terlalu pendek — sinyal satu bar memang selama itu, dan memutusnya '
    + 'menggagalkan permintaan yang sebenarnya masih akan berhasil')
  // Penjaga sesi di authStore sudah menahan halaman ini sampai 5 detik lebih
  // dulu, dan batas ini menyusul SETELAHNYA. Diukur sungguhan di peramban:
  // dengan 12 detik, pesan galat pertama baru muncul di detik ketujuh belas.
  assert(BATAS_MUAT_MS + 5000 <= 14000,
    'sesi (5 dtk) + muat harus di bawah 14 detik; di atas itu orang sudah '
    + 'menyimpulkan aplikasinya rusak sebelum pesannya sempat muncul')
}

// ── 5. Galat diperiksa SEBELUM "kosong" ────────────────────────────
//
// Halaman yang gagal memuat dan halaman yang proyeknya memang belum dihitung
// terlihat sama dari luar, tetapi yang pertama masih bisa diperbaiki dengan
// mencoba lagi. Menyebut keduanya "belum ada hasil" mengirim orang menghitung
// ulang proyek yang datanya sebenarnya baik-baik saja.
{
  const K = (o) => keadaanMuat({ sesiMemuat: false, memuat: false, galat: '', adaHasil: false, ...o })
  assert(K({ galat: 'gagal' }) === 'galat', 'galat menang atas kosong')
  assert(K({}) === 'kosong', 'tanpa galat & tanpa hasil: memang kosong')
  assert(K({ adaHasil: true }) === 'siap', 'ada hasilnya')
  assert(K({ memuat: true }) === 'memuat', 'sedang memuat')

  // Sesi didahulukan dari segalanya: tautan hasil sering dibuka LANGSUNG, dan
  // pada pembukaan pertama sesinya belum selesai. Pemuatnya melihat user masih
  // null, pulang tanpa mengambil apa pun, lalu halamannya berkata "belum ada
  // hasil" atas proyek yang datanya baik-baik saja.
  assert(K({ sesiMemuat: true }) === 'tunggu-sesi', 'sesi belum siap')
  assert(K({ sesiMemuat: true, adaHasil: true }) === 'tunggu-sesi', 'bahkan bila hasilnya sudah ada')
  assert(K({ sesiMemuat: true, galat: 'x' }) === 'tunggu-sesi',
    'galat dari percobaan sebelum sesi siap tidak ditampilkan')
}

// ── 6. Pesan galat yang bisa dibaca orang ─────────────────────────
//
// Yang dilihat pemakai jangan pernah "[object Object]" atau nama tabel
// database. Bagi yang membacanya di lapangan keduanya sama-sama berarti
// "rusak", dan tidak satu pun memberi tahu apa yang bisa ia lakukan.
{
  assert(!/object Object/.test(pesanGalatMuat({})), 'objek kosong tidak bocor ke layar')
  assert(pesanGalatMuat(null).length > 10, 'null tetap menghasilkan kalimat')
  assert(pesanGalatMuat('').length > 10, 'string kosong juga')
  assert(/muat ulang/i.test(pesanGalatMuat(null)), 'dan menyebut jalan keluarnya')

  assert(/koneksi/i.test(pesanGalatMuat(new Error('Failed to fetch'))),
    'galat jaringan diterjemahkan')
  assert(/[Ss]esi login/.test(pesanGalatMuat(new Error('JWT expired'))),
    'token kedaluwarsa disebut sebagai sesi, bukan JWT')
  assert(/akses/i.test(pesanGalatMuat(new Error('row-level security policy'))),
    'RLS diterjemahkan jadi soal akses, bukan istilah database')
  assert(pesanGalatMuat(new Error('Kuota habis')) === 'Kuota habis',
    'pesan yang memang sudah jelas diteruskan apa adanya')
}

// ── 7. Sesi mati: jalan keluarnya masuk ulang, bukan coba lagi ────
//
// Menyuruh orang mencoba lagi berulang kali atas sesi yang sudah mati adalah
// menyuruhnya gagal berulang kali.
{
  assert(perluMasukUlang(pesanGalatMuat(new Error('JWT expired'))) === true, 'sesi mati')
  assert(perluMasukUlang(pesanGalatMuat(new Error('Failed to fetch'))) === false,
    'jaringan putus: mencoba lagi memang masuk akal')
  assert(perluMasukUlang(null) === false, 'kosong aman')
}

// ── 8. Halamannya benar-benar memakai semua ini ──────────────────
//
// Modul yang benar tetapi tidak dipasang tidak memperbaiki apa pun — dan
// justru begitulah cacat ini lahir: kodenya ada, penanganan galatnya tidak.
{
  const akar = new URL('../src', import.meta.url).pathname
  const hal = readFileSync(join(akar, 'pages/ResultPage.tsx'), 'utf8')

  assert(/catch/.test(hal), 'ada penanganan galat')
  assert(/finally/.test(hal),
    'dan penanda selesai ada di finally — kalau di baris terakhir try, '
    + 'ia tidak pernah tercapai ketika ada yang melempar')
  assert(/denganBatasWaktu\(/.test(hal), 'permintaannya diberi batas waktu')
  assert(/keadaanMuat\(/.test(hal), 'keadaan layarnya diputuskan di satu tempat')
  assert(/data-muat-ulang/.test(hal), 'ada tombol mencoba lagi, bukan jalan buntu')
  assert(/isLoading/.test(hal), 'menunggu sesi selesai sebelum menyimpulkan kosong')
}

// ── 9. Halaman input punya cacat yang PERSIS SAMA ─────────────────
//
// Bentuk kodenya identik: tanpa penanganan galat, penanda selesai di dalam
// jalur yang berhasil. Di sana bahkan lebih buruk — `createProject()` melempar
// dengan sengaja ketika belum login, dan ketika itu terjadi yang terlihat
// hanya lingkaran berputar.
{
  const akar = new URL('../src', import.meta.url).pathname
  const inp = readFileSync(join(akar, 'pages/InputPage.tsx'), 'utf8')
  assert(/finally \{/.test(inp), 'penanda selesai dipasang di finally')
  assert(/pesanGalatMuat\(/.test(inp), 'galatnya diterjemahkan, bukan ditelan')
  assert(/denganBatasWaktu\(/.test(inp), 'dan permintaannya diberi batas waktu')
  assert(/data-galat-muat/.test(inp), 'ada layar galatnya')

  // Tidak boleh ada lagi pemuat yang penanda selesainya cuma di jalur berhasil.
  const hasil = readFileSync(join(akar, 'pages/ResultPage.tsx'), 'utf8')
  for (const [nama, isi] of [['ResultPage', hasil], ['InputPage', inp]]) {
    const iTry = isi.indexOf('try {')
    const iFinally = isi.indexOf('finally {')
    assert(iTry > -1 && iFinally > iTry, `${nama}: finally menyusul try, bukan sebaliknya`)
  }
}

// ── 10. Galat store tidak lagi dibuang diam-diam ──────────────────
//
// `loadProject` dulu mengambil `{ data }` saja dan membuang `error`. Proyek
// yang tidak ada, salah akun, atau ditolak RLS sama-sama berakhir dengan data
// null dan tidak ada yang terjadi — halamannya lalu berkata "belum ada hasil"
// untuk tiga sebab berbeda, dan tidak satu pun bisa ditelusuri.
{
  const akar = new URL('../src', import.meta.url).pathname
  const store = readFileSync(join(akar, 'store/fsStore.ts'), 'utf8')
  assert(/const \{ data, error \} = await supabase/.test(store), 'error ikut diambil')
  assert(/if \(error && !cached\)/.test(store),
    'dan dilempar — kecuali bila ada salinan cache, karena pemakai tanpa sinyal '
    + 'lebih baik melihat angka kemarin daripada layar galat')
}

// ── 11. Layar tunggu BERUBAH seiring waktu ────────────────────────
//
// Lingkaran berputar yang diam selama belasan detik tidak bisa dibedakan dari
// yang macet. Satu baris yang berubah sudah cukup membuktikan aplikasinya
// masih bekerja — dan itu menahan orang dari menutup paksa halaman tepat
// sebelum datanya sampai.
{
  const a = pesanTunggu(0), b = pesanTunggu(5), c = pesanTunggu(10)
  assert(a !== b && b !== c, 'kalimatnya berganti, tidak diam sepanjang penantian')
  assert(/[Mm]emuat/.test(a), 'awalnya biasa saja — jangan menakut-nakuti sejak detik nol')
  assert(/lambat/i.test(b), 'lalu menyebut kemungkinan sebabnya')
  assert(/pesan/i.test(c), 'lalu menjanjikan penjelasan, bukan menggantung terus')
  assert(pesanTunggu(-5) === pesanTunggu(0), 'angka aneh aman')
  assert(typeof pesanTunggu(NaN) === 'string', 'NaN aman')
}

console.log(`muat-hasil: ${ok} assert lulus`)
