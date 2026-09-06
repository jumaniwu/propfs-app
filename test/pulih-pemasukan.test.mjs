// ============================================================
// Pemasukan yang hilang ditarik kembali dari kwitansinya.
//
// Pemasukan hidup di `akuntan_data` sebagai SATU dokumen JSON per pemakai —
// seluruh daftarnya dalam satu baris, ditulis ulang utuh setiap ada
// perubahan. Bentuk itu punya satu cara gagal yang sangat mahal: satu
// penulisan yang keliru menghapus SEMUANYA, bukan satu baris.
//
// Kwitansi tidak begitu. Tiap kwitansi adalah baris tersendiri, dan ia
// menyimpan `pemasukan_id` — id entri yang menjadi asalnya. Setiap kwitansi
// yang pernah terbit karena itu adalah bukti tahan lama bahwa sebuah entri
// pemasukan pernah ada, lengkap dengan tanggal, nominal, dan pembayarnya.
//
// Yang diuji di sini adalah batas-batasnya: apa yang BOLEH dipulihkan, dan
// yang lebih penting, apa yang tidak — karena memulihkan terlalu banyak
// berarti menghitung uang dua kali, dan itu lebih buruk daripada kehilangan.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rencanaPulih, kalimatPulih } from '../src/lib/pulihPemasukan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const kw = (o) => ({
  id: o.id ?? 'k1', nomor: o.nomor ?? 'KW/2026/08/0001',
  tanggal: o.tanggal ?? '2026-08-14', jumlah: o.jumlah ?? 177000000,
  pemasukan_id: o.pemasukan_id ?? 'p1',
  penerima_dari: o.penerima_dari ?? 'Michael Fadjar Wirawan',
  untuk_pembayaran: o.untuk_pembayaran ?? 'DP 20% Renovasi',
  project_name: o.project_name ?? 'Rumah Noble Cove',
  catatan: o.catatan ?? '',
})

// ── 1. Kasus yang dilaporkan: kwitansi ada, pemasukannya lenyap ─────
{
  const r = rencanaPulih([kw({})], [], [])
  assert(r.entri.length === 1, 'satu pemasukan dipulihkan')
  assert(r.entri[0].id === 'p1', 'id ASLINYA dipakai kembali, bukan id baru')
  assert(r.entri[0].jumlah === 177000000, 'nominalnya utuh')
  assert(r.entri[0].tanggal === '2026-08-14', 'tanggalnya dari kwitansi')
  assert(r.entri[0].sumber === 'DP 20% Renovasi', 'uraiannya yang jadi sumber')
  assert(/Michael Fadjar Wirawan/.test(r.entri[0].keterangan), 'pembayarnya tercatat')
  assert(/KW\/2026\/08\/0001/.test(r.entri[0].keterangan), 'asal-usulnya bisa ditelusuri')
  assert(r.totalRupiah === 177000000, 'totalnya bisa dicocokkan mata')
}

// Memakai id asli itu penting: kalau salinan lama suatu saat kembali dari
// perangkat lain, ia menimpa entri yang sama — bukan menambah yang kedua.
{
  const r = rencanaPulih([kw({})], [], [])
  const gabung = new Map([...[{ id: 'p1', jumlah: 177000000 }], ...r.entri].map(e => [e.id, e]))
  assert(gabung.size === 1, 'id yang sama tidak melahirkan entri kembar saat digabung')
}

// ── 2. Yang MASIH ADA tidak disentuh ────────────────────────────────
//
// Menimpanya berarti membuang suntingan yang mungkin dilakukan sesudah
// kwitansinya terbit.
{
  const r = rencanaPulih([kw({})], [{ id: 'p1' }], [])
  assert(r.entri.length === 0, 'entri yang masih ada tidak dipulihkan ulang')
  assert(r.dilewati.length === 0, 'dan itu bukan "dilewati" — memang tidak perlu apa-apa')
  assert(/sudah punya catatan/.test(kalimatPulih(r)), 'kalimatnya mengatakan tidak ada yang perlu')
}

// ── 3. Yang SENGAJA DIHAPUS tidak dihidupkan lagi ───────────────────
//
// Store menyimpan nisan justru supaya penghapusan tidak dibatalkan diam-diam
// oleh sinkronisasi berikutnya.
{
  const r = rencanaPulih([kw({})], [], ['p1'])
  assert(r.entri.length === 0, 'entri bernisan tidak dihidupkan')
  assert(/sengaja dihapus/.test(r.dilewati[0].sebab), 'dan sebabnya disebutkan')

  // Nisan juga bisa berbentuk objek.
  const objek = rencanaPulih([kw({})], [], [{ id: 'p1' }])
  assert(objek.entri.length === 0, 'nisan berbentuk objek ikut dihormati')
}

// ── 4. Kwitansi tanpa pemasukan_id TIDAK dipulihkan ─────────────────
//
// Ia terbit sebelum kolomnya ada, atau lepas dari entri mana pun. Membuatkan
// entri baru berisiko menghitung uang yang sama dua kali — entri aslinya bisa
// saja masih ada dengan id berbeda. Kehilangan bisa diperbaiki; uang yang
// terhitung dua kali menyesatkan tanpa ada yang tahu.
{
  const r = rencanaPulih([kw({ pemasukan_id: '' })], [], [])
  assert(r.entri.length === 0, 'tidak dipulihkan')
  assert(r.dilewati.length === 1, 'tapi dilaporkan, bukan didiamkan')
  assert(/tidak menyimpan id/.test(r.dilewati[0].sebab), 'sebabnya jelas')
  assert(/KW\/2026\/08\/0001/.test(r.dilewati[0].nomor), 'nomornya disebut supaya bisa dicari')
}

// ── 5. Satu entri, beberapa kwitansi → tetap satu ───────────────────
//
// Kwitansi bisa dicetak & dikirim ulang. Tanpa penjaga ini uangnya berlipat.
{
  const r = rencanaPulih([
    kw({ id: 'k1', nomor: 'KW/1', pemasukan_id: 'p1' }),
    kw({ id: 'k2', nomor: 'KW/2', pemasukan_id: 'p1' }),
  ], [], [])
  assert(r.entri.length === 1, 'satu entri saja')
  assert(r.totalRupiah === 177000000, 'nominalnya tidak berlipat')
}

// ── 6. Nominal nol tidak dipulihkan ─────────────────────────────────
{
  const r = rencanaPulih([kw({ jumlah: 0 })], [], [])
  assert(r.entri.length === 0 && /nominalnya nol/.test(r.dilewati[0].sebab), 'nol dilewati & disebut')
}

// ── 7. Masukan yang rusak tidak merusak hasilnya ────────────────────
{
  assert(rencanaPulih(null, null, null).entri.length === 0, 'null aman')
  assert(rencanaPulih([], [], []).entri.length === 0, 'kosong aman')
  const aneh = rencanaPulih([kw({ jumlah: 'bukan angka' })], [], [])
  assert(aneh.entri.length === 0, 'jumlah yang bukan angka dibaca nol, tidak menular NaN')
  assert(!/NaN/.test(kalimatPulih(aneh)), 'NaN tidak pernah sampai ke layar')
}

// ── 8. Kalimat konfirmasi menyebut NOMINALNYA ───────────────────────
//
// "3 entri" tidak bisa dicocokkan dengan ingatan orang tentang uang yang
// masuk; angka rupiahnya bisa.
{
  const r = rencanaPulih([
    kw({ id: 'k1', nomor: 'KW/1', pemasukan_id: 'p1', jumlah: 177000000 }),
    kw({ id: 'k2', nomor: 'KW/2', pemasukan_id: 'p2', jumlah: 23000000 }),
    kw({ id: 'k3', nomor: 'KW/3', pemasukan_id: '' }),
  ], [], [])
  const s = kalimatPulih(r)
  assert(/Rp 200\.000\.000/.test(s), 'nominal totalnya disebut dalam format Indonesia')
  assert(/2 pemasukan/.test(s), 'jumlah entrinya disebut')
  assert(/1 kwitansi dilewati/.test(s), 'yang dilewati juga disebut, bukan disembunyikan')
  assert(/tidak diubah/.test(s), 'ditegaskan entri yang ada tidak disentuh')
}

// ── 9. Layarnya benar-benar memakai ini ─────────────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const tab = readFileSync(join(akar, 'components/cost/TabAkuntan.tsx'), 'utf8')
  assert(/rencanaPulih/.test(tab), 'panel pemulihan memakai rencanaPulih')
  assert(/kalimatPulih/.test(tab), 'dan kalimat konfirmasi yang sama')
}

console.log(`pulih-pemasukan: ${ok} assert lulus`)
