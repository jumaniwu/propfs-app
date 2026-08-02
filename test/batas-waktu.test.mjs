// Test batas waktu satu langkah asinkron.
import { batasWaktu } from '../src/lib/batasWaktu.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const tunda = ms => new Promise(r => setTimeout(r, ms))

// Yang selesai tepat waktu memakai hasilnya sendiri.
assert(await batasWaktu(Promise.resolve('asli'), 100, 'cadangan') === 'asli',
  'hasil asli dipakai bila datang tepat waktu')

// Yang MENGGANTUNG — inti persoalannya — tetap menghasilkan jawaban.
{
  const menggantung = new Promise(() => {}) // tidak pernah selesai, seperti supabase-js yang macet
  const mulai = Date.now()
  const hasil = await batasWaktu(menggantung, 60, 'cadangan')
  assert(hasil === 'cadangan', 'janji yang tidak pernah selesai tetap dijawab')
  assert(Date.now() - mulai < 400, 'dijawab segera setelah tenggat, tidak menunggu selamanya')
}

// Yang gagal juga dijawab, bukan dilempar ke pemanggilnya.
assert(await batasWaktu(Promise.reject(new Error('mati')), 100, 'cadangan') === 'cadangan',
  'kegagalan dijawab dengan cadangan, tidak melempar')

// Yang terlambat sedikit tetap kalah oleh tenggat.
assert(await batasWaktu(tunda(200).then(() => 'telat'), 50, 'cadangan') === 'cadangan',
  'yang datang setelah tenggat diabaikan')

// Hasil yang datang setelah tenggat TIDAK boleh menimpa jawaban yang sudah
// diberikan — di UI itu berarti layar berubah sendiri beberapa detik kemudian.
{
  let dipakai = null
  const janji = tunda(80).then(() => 'terlambat')
  dipakai = await batasWaktu(janji, 20, 'cadangan')
  await tunda(150)
  assert(dipakai === 'cadangan', 'jawaban tidak berubah setelah diberikan')
}

// Nilai palsu (0, '', false, null) adalah jawaban yang sah, bukan kegagalan.
assert(await batasWaktu(Promise.resolve(0), 100, 99) === 0, 'nol adalah jawaban yang sah')
assert(await batasWaktu(Promise.resolve(''), 100, 'x') === '', 'teks kosong adalah jawaban yang sah')
assert(await batasWaktu(Promise.resolve(null), 100, 'x') === null, 'null adalah jawaban yang sah')

// Tenggat aneh tidak merusak apa pun.
assert(await batasWaktu(new Promise(() => {}), 0, 'cadangan') === 'cadangan', 'tenggat nol langsung menjawab')
assert(await batasWaktu(new Promise(() => {}), -5, 'cadangan') === 'cadangan', 'tenggat negatif tidak menggantung')

// Dipakai berulang tidak saling mengganggu.
{
  const hasil = await Promise.all([
    batasWaktu(tunda(10).then(() => 'a'), 100, 'x'),
    batasWaktu(new Promise(() => {}), 30, 'y'),
    batasWaktu(Promise.reject(new Error('z')), 100, 'z'),
  ])
  assert(hasil.join(',') === 'a,y,z', `masing-masing berdiri sendiri: ${hasil.join(',')}`)
}

console.log(`batas-waktu: ${ok} assert lulus`)
