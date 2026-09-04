// ============================================================
// Galat dari server harus MENYEBUTKAN sebabnya.
//
// Halaman kalender progres yang dibuka pemilik rumah berbunyi persis
// "Gagal (HTTP 500)." dan tidak lebih. Yang membacanya tidak bisa berbuat
// apa-apa, dan yang memperbaikinya tidak bisa menebak apa-apa — status 500
// menutupi sebab yang sangat berbeda-beda: fungsinya belum ada karena
// migrasinya belum dijalankan, tabelnya belum ada, kolomnya berubah, atau
// memang ada kekeliruan di dalam fungsinya.
//
// Sebabnya sebenarnya SELALU dikirim: PostgREST menjawab dengan badan JSON
// berisi `message`, `details`, `hint`, dan `code`. Kode pemanggilnya membuang
// seluruhnya lalu menyusun kalimat dari status HTTP saja.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bacaGalatServer, badanRespons } from '../src/lib/galatServer.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Fungsi belum ada = migrasi belum dijalankan ──────────────────
//
// Pesan aslinya ("function ... does not exist") benar tetapi tidak menunjuk
// ke mana pun bagi yang membacanya. Menyebut migrasinya langsung menghemat
// penelusuran yang panjang.
{
  const g = bacaGalatServer(500, {
    code: '42883', message: 'function public.field_log_by_view_token(p_token => text) does not exist',
  })
  assert(g.perluMigrasi === true, 'ditandai sebagai soal migrasi')
  assert(/migrasi/i.test(g.pesan), 'kalimatnya menyebut migrasi')
  assert(/CEK_MIGRASI/.test(g.pesan), 'dan berkas mana yang dijalankan lebih dulu')
  assert(!/HTTP 500/.test(g.pesan), 'nomor statusnya sendiri tidak berguna, jadi tidak ditonjolkan')

  // Tanpa `code` pun tetap dikenali dari pesannya.
  const tanpaKode = bacaGalatServer(500, { message: 'function foo does not exist' })
  assert(tanpaKode.perluMigrasi === true, 'dikenali dari kalimatnya juga')
}

// ── 2. Tabel & kolom yang belum ada ────────────────────────────────
{
  const tabel = bacaGalatServer(500, { code: '42P01', message: 'relation "aset_pinjam" does not exist' })
  assert(/[Tt]abel/.test(tabel.pesan) && tabel.perluMigrasi === true, 'tabel belum ada')

  const kolom = bacaGalatServer(500, { code: '42703', message: 'column "kirim_alamat" does not exist' })
  assert(/kolom/i.test(kolom.pesan) && kolom.perluMigrasi === true, 'kolom belum ada')
}

// ── 3. Akses ditolak: jalan keluarnya BUKAN migrasi ────────────────
//
// Menyuruh orang menjalankan migrasi atas tautan yang kedaluwarsa akan
// membuatnya membongkar database untuk masalah yang tidak ada di sana.
{
  const g = bacaGalatServer(403, { code: '42501', message: 'permission denied for table field_logs' })
  assert(g.perluMigrasi === false, 'ini bukan soal migrasi')
  assert(/tautan/i.test(g.pesan), 'menyebut kemungkinan yang paling sering: tautannya kedaluwarsa')
  assert(/terbitkan ulang/i.test(g.pesan), 'dan tindakan yang bisa dilakukan')
}

// ── 4. Status lain punya kalimatnya sendiri ────────────────────────
{
  assert(/tidak ditemukan/i.test(bacaGalatServer(404, null, 'Proyek').pesan), '404')
  assert(/Proyek/.test(bacaGalatServer(404, null, 'Proyek').pesan), 'menyebut apa yang dicari')
  assert(/[Ss]esi login/.test(bacaGalatServer(401, null).pesan), '401 = sesi habis, bukan "gagal"')
  assert(/terlalu lama/i.test(bacaGalatServer(504, null).pesan), '504 = lambat')
  assert(/terlalu lama/i.test(bacaGalatServer(408, null).pesan), '408 juga')
}

// ── 5. Pesan asli diteruskan ketika tidak dikenali ────────────────
//
// Ia mungkin berbahasa Inggris dan berbau teknis, tetapi menyebut sesuatu
// yang bisa ditelusuri — jauh lebih berguna daripada nomor status sendirian.
{
  const g = bacaGalatServer(500, { message: 'division by zero' })
  assert(/division by zero/.test(g.pesan), 'pesan aslinya ikut')
  assert(/gagal/i.test(g.pesan), 'dengan awalan yang menerangkan konteksnya')

  // Badan berupa teks biasa juga dipakai.
  assert(/gateway/i.test(bacaGalatServer(500, 'bad gateway').pesan), 'badan teks biasa')
}

// ── 6. Badan yang tidak bisa dibaca tetap menghasilkan kalimat ────
//
// Badan kosong tidak boleh menjadi galat baru yang menutupi galat aslinya.
{
  assert(bacaGalatServer(500, null).pesan.length > 15, 'tetap ada kalimatnya')
  assert(/HTTP 500/.test(bacaGalatServer(500, null).pesan),
    'nomor status dipakai HANYA ketika tidak ada keterangan lain sama sekali')
  assert(bacaGalatServer(undefined, undefined).pesan.length > 10, 'kosong aman')
  assert(!/undefined|null|NaN/.test(bacaGalatServer(undefined, undefined).pesan),
    'tidak membocorkan nilai kosong ke layar')
  assert(!/\[object Object\]/.test(bacaGalatServer(500, { aneh: {} }).pesan), 'objek aneh tidak bocor')
}

// ── 7. Membaca badan respons tidak pernah melempar ────────────────
{
  const jsonOk = { clone: () => ({ json: async () => ({ code: 'X' }), text: async () => '' }) }
  assert((await badanRespons(jsonOk)).code === 'X', 'JSON terbaca')

  const bukanJson = { clone: () => ({ json: async () => { throw new Error('x') }, text: async () => 'teks' }) }
  assert(await badanRespons(bukanJson) === 'teks', 'jatuh ke teks biasa')

  const rusak = { clone: () => { throw new Error('sudah dibaca') } }
  assert(await badanRespons(rusak) === null, 'badan yang tidak bisa dibaca: null, bukan lemparan')
  assert(await badanRespons({}) === null, 'respons tanpa apa-apa aman')
}

// ── 8. Pemanggilnya benar-benar memakai ini ───────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const fr = readFileSync(join(akar, 'lib/fieldReports.ts'), 'utf8')
  const kode = fr.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
  assert(!/throw new Error\(`Gagal \(HTTP \$\{res\.status\}\)\.`\)/.test(kode),
    'kalimat yang hanya berisi nomor status sudah tidak ada')
  assert(/bacaGalatServer\(res\.status, await badanRespons\(res\)/.test(kode),
    'pesan server dibaca lebih dulu')
}

console.log(`galat-server: ${ok} assert lulus`)
