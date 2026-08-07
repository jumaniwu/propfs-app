// Test sidik kunci & kesimpulan Tes Koneksi Gemini.
import { kesimpulanTes } from '../src/lib/tesAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// Sidik kunci dan pengujian kunci manual dihapus bersama kuncinya: sejak
// kunci pindah ke server, browser memang tidak memegang apa pun untuk
// dicocokkan maupun dicoba. Yang tersisa untuk diuji di sini adalah bagaimana
// keadaan server diterjemahkan menjadi satu kalimat.

// ── Kesimpulan ───────────────────────────────────────────────────────────
const hasil = (o) => ({
  adaKunci: true, ok: false, jenis: 'kunci', pesan: '', diagnosa: null,
  ms: 10, model: [], modelDipakai: null, modelLebihBaik: null, ...o,
})

assert(kesimpulanTes(hasil({ ok: true })).siap === true, 'server menjawab = siap')
{
  // Kunci yang belum dipasang di SERVER disebut apa adanya, dan namanya tanpa
  // awalan VITE_ — sebab awalan itulah yang dulu membocorkannya ke browser.
  const k = kesimpulanTes(hasil({
    adaKunci: false,
    diagnosa: { sebab: 'kunci_salah', apa: 'x', perbaikan: 'y', asli: '', sisiKami: true },
  }))
  assert(/GEMINI_API_KEY/.test(k.pesan), 'menyebut nama variabelnya')
  assert(!/VITE_/.test(k.pesan), 'dan BUKAN yang berawalan VITE_ — itu yang dulu bocor')
  assert(/server/i.test(k.pesan), 'serta menyebut bahwa tempatnya di server')
}
{
  const k = kesimpulanTes(hasil({
    diagnosa: { sebab: 'api_mati', apa: 'API belum diaktifkan.', perbaikan: 'y', asli: '', sisiKami: true },
  }))
  assert(k.pesan === 'API belum diaktifkan.', 'kesimpulannya memakai sebab hasil diagnosis, bukan kata "gagal"')
}
assert(kesimpulanTes(null).siap === false, 'belum diuji bukan berarti siap')

console.log(`tes-ai: ${ok} assert lulus`)
