// ============================================================
// Tombol "Hitung" tidak boleh berputar selamanya.
//
// GEJALANYA: di Step 7, tombol "Simpan & Publish Hitungan" berubah menjadi
// "Menyimpan…" dan tidak pernah selesai.
//
// SEBABNYA: sebelum mengirim, supabase-js mengambil token login lewat antrean
// internal yang tidak punya batas waktu. Bila penyegaran token tersendat di
// jaringan, pengambilan itu menunggu selamanya — pembatal permintaan 20 detik
// tidak berlaku, karena permintaannya belum berangkat. Antrean simpan "satu
// kiriman sekaligus" lalu tertahan di belakang kiriman yang macet itu, dan
// tombol Hitung menunggu di belakangnya juga.
//
// Diuji dengan halaman input asli di peramban: kode lama tetap "Menyimpan…"
// lebih dari 60 detik; kode ini pindah ke hasil dalam ±12 detik, memakai
// isian revisi, dan penyimpanan berikutnya berhasil begitu jaringan pulih.
// Berkas ini mengunci bagian-bagiannya.
// ============================================================
import { readFileSync } from 'node:fs'
import { batasWaktu } from '../src/lib/batasWaktu.ts'
import { buatSatuSekaligus, drafLebihBaru } from '../src/lib/simpanDraf.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const baca = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const tidur = ms => new Promise(r => setTimeout(r, ms))
const store = baca('src/store/fsStore.ts')
const hal = baca('src/pages/InputPage.tsx')

// ── 1. Kiriman yang tidak pernah selesai tidak lagi menahan antrean ──
{
  const BATAS = 40
  const g = buatSatuSekaligus()
  let macet = true
  const tercatat = []

  // Bentuk yang sama dengan saveCurrentProject: giliran → kirim dibatasi
  // batasWaktu → lepas di finally.
  async function simpan(versi) {
    const tunggu = g.masuk(() => simpan(versi))
    if (tunggu) return tunggu
    try {
      const kirim = macet ? new Promise(() => {}) : Promise.resolve({ error: null })
      const { error } = await batasWaktu(kirim, BATAS, { error: { message: 'server tidak menjawab' } })
      tercatat.push(error ? 'gagal' : 'tersimpan')
    } finally {
      g.keluar()
    }
  }

  const mulai = Date.now()
  const a = simpan(1)            // macet: token tidak pernah tersedia
  const bJanji = simpan(2)       // menunggu di belakangnya
  await Promise.all([a, bJanji])
  const lama = Date.now() - mulai
  assert(tercatat.join() === 'gagal,gagal', 'kiriman macet berakhir sebagai GAGAL, bukan menggantung')
  assert(lama < BATAS * 4, `antrean tidak tertahan selamanya (${lama} ms)`)
  assert(!g.sibuk(), 'giliran dilepas')
  macet = false
  await simpan(3)
  assert(tercatat.at(-1) === 'tersimpan', 'begitu jaringan pulih, penyimpanan berikutnya berhasil')

  // Pembanding: TANPA batas keras, antreannya memang tertahan.
  const g2 = buatSatuSekaligus()
  let selesai2 = false
  ;(async () => {
    const t = g2.masuk(async () => {})
    if (t) return t
    try { await new Promise(() => {}) } finally { g2.keluar() }
  })()
  const tunggu2 = g2.masuk(async () => { selesai2 = true })
  await tidur(BATAS * 3)
  assert(tunggu2 && !selesai2 && g2.sibuk(), 'tanpa batas keras, satu kiriman macet menahan semua yang di belakangnya')
}

// ── 2. Batas keras terpasang di penyimpanan FS ───────────────────────
{
  const blok = store.match(/saveCurrentProject: async \(\) => \{[\s\S]*?\n  \},/)[0]
  assert(/\.abortSignal\(ctrl\.signal\)/.test(blok), 'pembatal permintaan tetap ada')
  assert(/await batasWaktu\(kirim, BATAS_SIMPAN_MS \+ 1000,/.test(blok), 'kiriman dibatasi KERAS, termasuk saat menunggu token')
  assert(blok.indexOf('giliranSimpan.masuk(') < blok.indexOf('await batasWaktu(kirim'), 'batas keras ada di dalam giliran')
  assert(/giliranSimpan\.keluar\(\)/.test(blok.match(/\} finally \{[\s\S]*?\n    \}/)[0]), 'giliran dilepas di finally')

  // Pesannya: yang tidak menjawab dibaca sebagai waktu habis.
  const src = store.match(/function pesanSimpanGagal\(e: unknown\): string \{[\s\S]*?\n\}/)[0]
  const js = src.replace('(e: unknown): string', '(e)').replace(/e instanceof DOMException/g, 'false')
  const pesanSimpanGagal = new Function(`${js}; return pesanSimpanGagal`)()
  const p = pesanSimpanGagal(new Error('server tidak menjawab'))
  assert(/Waktu habis/.test(p) && /aman di perangkat/.test(p) && /muat ulang/.test(p),
    'kiriman yang tidak menjawab dijelaskan, dengan saran muat ulang')
  assert(pesanSimpanGagal(new Error('new row violates row-level security policy')).includes('row-level'),
    'galat lain tetap disampaikan apa adanya')
}

// ── 3. Tombol Hitung menunggu, tetapi tidak tanpa batas ──────────────
{
  const blok = hal.match(/async function handleCalculate\(\)[\s\S]*?\n  \}/)[0]
  assert(/const selesai = await batasWaktu\(saveProject\(\)\.then\(\(\) => true\), BATAS_TUNGGU_HITUNG_MS, false\)/.test(blok),
    'penyimpanan ditunggu dengan batas')
  const batas = Number(hal.match(/const BATAS_TUNGGU_HITUNG_MS = (\d+)/)[1])
  assert(batas >= 5000 && batas <= 20000, `batas tunggu masuk akal (${batas} ms)`)
  assert(!/await saveProject\(\)\s*\n/.test(blok), 'tidak ada lagi penantian tanpa batas')
  const posPindah = blok.indexOf('navigate(`/result/${currentProjectId}`)')
  const posSelesai = blok.indexOf('if (!selesai) {')
  assert(posSelesai > 0 && posPindah > posSelesai, 'halaman hasil tetap dibuka walau penyimpanan belum selesai')
  assert(/masih berjalan/.test(blok), 'pemakai diberi tahu penyimpanannya masih berjalan')
  assert(/\} finally \{\s*\n\s*setMenghitung\(false\)/.test(blok), 'penanda tombol selalu dipadamkan')
}

// ── 4. Halaman hasil memakai isian terbaru, bukan salinan lama ───────
{
  const muat = store.match(/loadProject: async \(id\) => \{[\s\S]*?\n  \},/)[0]
  const langkah1 = muat.slice(0, muat.indexOf('if (IS_DEV_MODE) return'))
  assert(/bacaDraf<typeof cached\.inputs>\(id\)/.test(langkah1) && /drafLebihBaru\(draf, cached\.updatedAt\)/.test(langkah1),
    'salinan perangkat: draf yang lebih baru menang SEBELUM server menjawab')
  assert(/migrateInputs\(isiTerbaru\)/.test(langkah1), 'isian yang dipasang adalah yang terbaru')

  const kemarin = new Date(Date.now() - 86_400_000).toISOString()
  assert(drafLebihBaru({ at: new Date().toISOString() }, kemarin), 'revisi tadi lebih baru daripada salinan kemarin')
  assert(!drafLebihBaru({ at: kemarin }, new Date().toISOString()), 'draf basi tidak menimpa salinan yang lebih baru')
}

console.log(`simpan-macet: ${ok} pemeriksaan lolos`)
