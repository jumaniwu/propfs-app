// Test sidik kunci & kesimpulan Tes Koneksi Gemini.
import { kesimpulanTes, petunjukVariabel } from '../src/lib/tesAi.ts'

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

// ── "Belum terbaca" itu tiga keadaan, bukan satu ─────────────────────────
//
// Belum ditambahkan sama sekali, salah nama, atau tercentang untuk Preview
// saja. Membedakannya dengan menebak berarti satu siklus deploy per tebakan —
// dan itu sudah beberapa kali terjadi. Server melaporkan NAMA variabel yang
// benar-benar ia lihat; nilainya tidak pernah ikut.
const badanTanpaKunci = (mirip) => JSON.stringify({
  error: { code: 500, status: 'NO_SERVER_KEY', message: 'GEMINI_API_KEY belum dipasang di server.',
    ...(mirip ? { variabelMirip: mirip } : {}) },
})
{
  const p = petunjukVariabel(badanTanpaKunci([]))
  assert(/SATU PUN/.test(p), 'tidak ada variabel mirip = dikatakan apa adanya')
  assert(/REDEPLOY|deploy ulang/i.test(p), 'dan tetap mengingatkan deploy ulang')
}
{
  // Keadaan yang paling mungkin: variabel lama masih ada, yang baru belum.
  const p = petunjukVariabel(badanTanpaKunci(['VITE_GEMINI_API_KEY']))
  assert(/VITE_GEMINI_API_KEY/.test(p), 'menyebut nama yang benar-benar dilihat server')
  assert(/DIHAPUS/.test(p), 'dan bahwa yang berawalan VITE_ harus dihapus, bukan dibiarkan')
  assert(/membocorkan/.test(p), 'beserta alasannya — supaya tidak dipasang lagi kelak')
}
{
  const p = petunjukVariabel(badanTanpaKunci(['GEMINI_APIKEY']))
  assert(/GEMINI_APIKEY/.test(p), 'salah nama disebutkan apa adanya')
  assert(/huruf besar-kecil|spasi/i.test(p), 'dan diarahkan memeriksa ejaannya')
  assert(!/DIHAPUS/.test(p), 'tanpa menyuruh menghapus sesuatu yang tidak perlu dihapus')
}
{
  // Server versi lama belum mengirim daftarnya — jangan meledak.
  const p = petunjukVariabel(badanTanpaKunci(null))
  assert(p.length > 0, 'server lama tetap menghasilkan petunjuk')
  assert(petunjukVariabel('bukan json').length > 0, 'badan bukan JSON aman')
  assert(petunjukVariabel('').length > 0, 'badan kosong aman')
}

console.log(`tes-ai: ${ok} assert lulus`)
