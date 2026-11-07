// ============================================================
// Kiriman ke cloud: satu jalur per proyek, yang terbaru selalu terakhir.
//
// GEJALANYA: aplikasi di HP menyimpan 99 transaksi (Rp 387,45 Jt), web hanya
// melihat 94 (Rp 372,26 Jt), dan penanda "Menyimpan…" di HP menyala terus.
//
// Dua sebab, keduanya diuji di sini dengan server tiruan yang bisa disuruh
// tersendat:
//   1. Kiriman tanpa batas waktu menggantung selamanya.
//   2. Kiriman tidak berurutan — versi lama yang tersendat lalu tiba sesudah
//      versi baru menimpanya di server.
// ============================================================
import { readFileSync } from 'node:fs'
import { buatAntrean, pesanKirimGagal } from '../src/lib/antreanKirim.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const tidur = ms => new Promise(r => setTimeout(r, ms))

/** Server tiruan: menyimpan versi terakhir yang TIBA, dan bisa diperlambat. */
function serverTiruan() {
  const tersimpan = new Map()
  const masuk = []
  let lambat = new Map()
  return {
    tersimpan, masuk,
    perlambat(versi, ms) { lambat.set(versi, ms) },
    async kirim(p) {
      masuk.push(p.versi)
      await tidur(lambat.get(p.versi) ?? 5)
      if (p.gagal) return false
      tersimpan.set(p.id, p.versi)   // server tidak tahu urutan — yang tiba belakangan menang
      return true
    },
  }
}

// ── 1. Tanpa antrean, versi lama MENIMPA yang baru ──────────────────
//
// Dibuktikan dulu bahwa masalahnya memang ada, supaya tes sesudahnya
// benar-benar menguji perbaikan, bukan keadaan yang memang tidak bisa rusak.
{
  const s = serverTiruan()
  s.perlambat(1, 60)                   // versi 1 tersendat di jaringan
  const a = s.kirim({ id: 'noble', versi: 1 })
  await tidur(5)
  const b = s.kirim({ id: 'noble', versi: 2 })
  await Promise.all([a, b])
  assert(s.tersimpan.get('noble') === 1, 'TANPA antrean: versi 1 yang tersendat menimpa versi 2 — data baru hilang')
}

// ── 2. Dengan antrean, yang terbaru selalu menang ───────────────────
{
  const s = serverTiruan()
  const kirim = buatAntrean(p => s.kirim(p), p => p.id)
  s.perlambat(1, 60)
  const a = kirim({ id: 'noble', versi: 1 })
  await tidur(5)
  const b = kirim({ id: 'noble', versi: 2 })
  await Promise.all([a, b])
  assert(s.tersimpan.get('noble') === 2, 'DENGAN antrean: versi 2 yang tersimpan')
  assert(s.masuk.join(',') === '1,2', 'dikirim berurutan, tidak bersamaan')
}

// ── 3. Ketukan beruntun dipadatkan, yang terakhir tidak tertinggal ──
{
  const s = serverTiruan()
  const kirim = buatAntrean(p => s.kirim(p), p => p.id)
  s.perlambat(1, 40)
  const janji = []
  for (let v = 1; v <= 10; v++) { janji.push(kirim({ id: 'noble', versi: v })); await tidur(1) }
  await Promise.all(janji)
  assert(s.tersimpan.get('noble') === 10, 'versi ke-10 yang tersimpan')
  assert(s.masuk.length === 2, `sepuluh ketukan menjadi ${s.masuk.length} kiriman, bukan sepuluh`)
  assert(s.masuk.join(',') === '1,10', 'versi antara dilewati — tidak perlu, sudah digantikan')
}

// ── 4. Proyek berbeda tidak saling menunggu ─────────────────────────
{
  const s = serverTiruan()
  const kirim = buatAntrean(p => s.kirim(p), p => p.id)
  s.perlambat('lambat', 80)
  const mulai = Date.now()
  const a = kirim({ id: 'soni', versi: 'lambat' })
  const b = kirim({ id: 'noble', versi: 'cepat' })
  await b
  assert(Date.now() - mulai < 60, 'proyek lain tidak tertahan oleh proyek yang tersendat')
  await a
  assert(s.tersimpan.get('soni') === 'lambat' && s.tersimpan.get('noble') === 'cepat', 'keduanya tersimpan')
}

// ── 5. Tidak ada perubahan yang hilang di celah antara dua kiriman ──
//
// Kiriman baru yang masuk TEPAT ketika kiriman sebelumnya selesai harus tetap
// berangkat. Kalau jalurnya dilepas belakangan, perubahan itu tersangkut di
// daftar tunggu tanpa ada yang mengirimnya.
{
  const s = serverTiruan()
  const kirim = buatAntrean(p => s.kirim(p), p => p.id)
  for (let putaran = 0; putaran < 30; putaran++) {
    const a = kirim({ id: 'noble', versi: putaran * 2 })
    // Disisipkan di microtask yang sama dengan selesainya kiriman pertama.
    a.then(() => { void kirim({ id: 'noble', versi: putaran * 2 + 1 }) })
    await a
    await tidur(15)
    assert(s.tersimpan.get('noble') === putaran * 2 + 1,
      `putaran ${putaran}: kiriman yang masuk di celah tetap sampai`)
  }
}

// ── 6. Kegagalan dilaporkan, dan antrean tidak macet karenanya ──────
{
  const s = serverTiruan()
  const kirim = buatAntrean(p => s.kirim(p), p => p.id)
  assert(await kirim({ id: 'x', versi: 1, gagal: true }) === false, 'kegagalan dilaporkan sebagai false')
  assert(await kirim({ id: 'x', versi: 2 }) === true, 'kiriman berikutnya tetap jalan')

  const meledak = buatAntrean(async () => { throw new Error('jaringan putus') }, p => p.id)
  assert(await meledak({ id: 'y' }) === false, 'galat dilempar tidak meledakkan antrean')
  assert(await meledak({ id: 'y' }) === false, 'dan tidak membuatnya macet selamanya')
}

// ── 7. Kalimat kegagalan ────────────────────────────────────────────
{
  const batal = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })
  assert(/Waktu habis/.test(pesanKirimGagal(batal)), 'waktu habis disebut apa adanya')
  assert(/aman di perangkat/.test(pesanKirimGagal(batal)), 'menenangkan: datanya masih di HP')
  // Galat dari supabase-js berupa objek biasa, bukan Error.
  assert(pesanKirimGagal({ message: 'JWT expired' }) === 'JWT expired', 'objek galat Supabase terbaca')
  assert(pesanKirimGagal(null) === 'Gagal mengirim ke server.', 'null tidak menjadi tulisan "null"')
}

// ── 8. costStore memang memakainya ──────────────────────────────────
{
  const src = readFileSync(new URL('../src/store/costStore.ts', import.meta.url), 'utf8')
  assert(/const kirimProyek = buatAntrean<SavedCostProject>\(upsertCloudProject/.test(src), 'antrean dipasang')
  assert(/void kirimProyek\(updatedProject\)/.test(src), 'setiap penyimpanan lewat antrean')
  // Satu-satunya `upsertCloudProject(` adalah definisinya; antrean merujuknya
  // tanpa kurung. Pemanggil langsung di tempat lain akan melewati antrean.
  assert((src.match(/upsertCloudProject\(/g) ?? []).length === 1,
    'tidak ada yang memanggil upsertCloudProject langsung — semuanya lewat antrean')
  assert(/\.abortSignal\(ctrl\.signal\)[\s\S]{0,40}if \(error\) throw error/.test(src), 'kiriman punya batas waktu')
  assert((src.match(/abortSignal\(ctrl\.signal\)/g) ?? []).length === 2, 'tarikan dari cloud juga dibatasi')
  assert(/finally \{\s*clearTimeout\(timer\)/.test(src), 'pengatur waktunya dibersihkan')
  // Data di HP disimpan SEBELUM dikirim — kalau urutannya terbalik, kegagalan
  // kirim berarti data hilang.
  assert(/saveLocalData\(nextProjects\)\s*\n\s*void kirimProyek/.test(src), 'disimpan di perangkat dulu, baru dikirim')
}

console.log(`antrean-kirim: ${ok} assert lulus`)
