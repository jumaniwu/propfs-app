// Test sidik kunci & kesimpulan Tes Koneksi Gemini.
import { sidikKunci, kesimpulanTes } from '../src/lib/tesAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Sidik kunci: cukup untuk mencocokkan, tidak cukup untuk dipakai ──────
//
// Setelah membayar, sebab 403 yang paling sering adalah kunci yang berasal
// dari project LAIN. Menyamakan kunci di aplikasi dengan kunci di Google
// Console adalah cara tercepat membuktikannya — dan itu mustahil bila
// kuncinya tidak terlihat sama sekali.
{
  const kunci = 'AIzaSyB1abcdefghijklmnopqrstuvwxyz0123'
  const s = sidikKunci(kunci)
  assert(s.startsWith('AIzaSy'), `awalnya terlihat untuk dicocokkan: ${s}`)
  assert(s.includes('0123'), 'akhirnya juga — itu yang ditampilkan Google Console')
  assert(!s.includes('abcdefghij'), 'tetapi bagian tengahnya TIDAK ikut terbaca')
  assert(s.includes(String(kunci.length)), 'panjangnya disebut: kunci terpotong ketahuan dari sini')
}
{
  // Kunci pendek tidak boleh membocorkan apa pun — menampilkan 6 dari 10
  // karakter sama saja dengan menampilkan kuncinya.
  const s = sidikKunci('pendek1234')
  assert(!s.includes('pendek'), `kunci pendek ditutup seluruhnya: ${s}`)
  assert(s.includes('10 karakter'), 'panjangnya tetap disebut')
}
assert(sidikKunci('') === '(kosong)', 'kunci kosong dikatakan kosong, bukan disamarkan')
assert(sidikKunci(null) === '(kosong)', 'null aman')
assert(sidikKunci('   ') === '(kosong)', 'spasi saja tetap dianggap kosong')

// ── Kesimpulan ───────────────────────────────────────────────────────────
const hasil = (o) => ({
  adaKunci: true, ok: false, jenis: 'kunci', pesan: '', diagnosa: null,
  ms: 10, sumberKunci: 'aplikasi', sidik: 'x', ...o,
})

assert(kesimpulanTes(hasil({ ok: true })).siap === true, 'kunci aplikasi berhasil = siap')
{
  // Inti alat ini: kunci manual yang berhasil BUKAN keberhasilan. Ia temuan —
  // kuncinya sudah benar, tetapi bukan itu yang dipakai aplikasi. Menyebutnya
  // "siap" akan membuat orang mengira masalahnya selesai padahal belum.
  const k = kesimpulanTes(hasil({ ok: true, sumberKunci: 'manual' }))
  assert(k.siap === false, 'kunci manual yang berhasil belum berarti aplikasinya siap')
  assert(/BERHASIL/.test(k.pesan), 'tetapi keberhasilannya disebut terang-terangan')
  assert(/VITE_GEMINI_API_KEY/.test(k.pesan), 'dan langkah berikutnya disebut persis')
  assert(/deploy/i.test(k.pesan), 'termasuk deploy ulang — tanpa itu tidak berlaku')
}
{
  const k = kesimpulanTes(hasil({
    adaKunci: false, diagnosa: { sebab: 'kunci_salah', apa: 'x', perbaikan: 'y', asli: '', sisiKami: true },
  }))
  assert(/belum terpasang/i.test(k.pesan), 'kunci yang belum dipasang dikatakan apa adanya')
}
{
  const k = kesimpulanTes(hasil({
    diagnosa: { sebab: 'api_mati', apa: 'API belum diaktifkan.', perbaikan: 'y', asli: '', sisiKami: true },
  }))
  assert(k.pesan === 'API belum diaktifkan.', 'kesimpulannya memakai sebab hasil diagnosis, bukan kata "gagal"')
}
assert(kesimpulanTes(null).siap === false, 'belum diuji bukan berarti siap')

console.log(`tes-ai: ${ok} assert lulus`)
