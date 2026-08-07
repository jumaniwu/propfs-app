// Test pemilahan riwayat chat sebelum dikirim balik ke AI.
import { pesanGalat, riwayatUntukModel } from '../src/lib/riwayatChat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Inti keluhan: model membaca galat sebagai ucapannya sendiri ──────────
//
// Gelembung galat disimpan di daftar pesan yang sama dengan jawaban sungguhan,
// dan seluruh daftar dikirim balik ke Gemini pada setiap pesan berikutnya.
// Model lalu membacanya sebagai ucapannya sendiri dan meneruskan peran itu —
// "saya tidak dapat memproses lampiran karena kuota penggunaan terlampaui" —
// meski permintaannya barusan BERHASIL dan kuotanya sudah pulih.
{
  const riwayat = [
    { id: 'system-start', role: 'assistant', text: 'Kirim foto nota, bukti transfer, atau ketik saja…' },
    { id: '1', role: 'user', text: 'Tes' },
    { id: '2', role: 'assistant', galat: true, text: '⚠️ Kuota layanan AI sudah terpakai habis.' },
    { id: '3', role: 'user', text: 'Beli semen 10 sak 650rb' },
    { id: '4', role: 'assistant', text: 'Baik, saya catat 10 sak semen Rp 650.000.' },
  ]
  const bersih = riwayatUntukModel(riwayat)
  assert(bersih.length === 3, `sapaan & galat dibuang, sisanya utuh: ${bersih.length}`)
  assert(!bersih.some(p => p.id === '2'), 'gelembung galat tidak ikut dikirim')
  assert(!bersih.some(p => p.id === 'system-start'), 'sapaan pembuka juga bukan percakapan')
  assert(bersih.some(p => p.id === '4'),
    'tetapi jawaban AI yang sungguhan TETAP dikirim — itulah konteks notanya')
  assert(bersih.some(p => p.id === '3'), 'dan pesan pemakai tidak pernah dibuang')
}

// ── Riwayat yang TERLANJUR tersimpan tanpa penanda ───────────────────────
//
// Penanda `galat` menyelesaikan masalah untuk pesan baru. Tetapi riwayat lama
// sudah berada di penyimpanan pemakai tanpa penanda apa pun; tanpa pengenalan
// berdasarkan isi, percakapan yang sudah teracuni akan terus meracuni dirinya
// sendiri — dan tidak ada yang memberi tahu bahwa ia perlu dibersihkan manual.
const lama = t => ({ id: 'x', role: 'assistant', text: t })
assert(pesanGalat(lama('⚠️ Layanan AI sedang sangat padat saat ini.')) === true,
  'gelembung berikon peringatan dikenali tanpa penanda')
assert(pesanGalat(lama('GEMINI_API_KEY belum terbaca di server.\n\nPerbaikan: Vercel → …')) === true,
  'diagnosis kunci server dikenali')
assert(pesanGalat(lama('Kuota layanan AI sudah terpakai habis.\n\nBiasanya pulih besok.')) === true,
  'pesan kuota dikenali')
assert(pesanGalat(lama('Sesuatu.\n\nKata Google: "You exceeded your current quota…"')) === true,
  'kutipan dari Google menandai gelembung galat')
assert(pesanGalat(lama('Sesuatu.\n\nKata server kami: "GEMINI_API_KEY belum dipasang."')) === true,
  'kutipan dari server kami juga')
assert(pesanGalat(lama('Ada masalah.\n\nRincian teknis: gemini-2.5-flash → 403')) === true,
  'baris rincian teknis untuk superadmin juga')

// ── Jawaban sungguhan TIDAK boleh ikut terbuang ──────────────────────────
//
// Batasnya harus tajam ke arah ini: membuang jawaban yang benar berarti
// menghapus konteks nota yang sedang dibicarakan, dan AI akan kehilangan
// jejak percakapannya sendiri.
assert(pesanGalat(lama('Baik, saya catat 10 sak semen Rp 650.000.')) === false,
  'jawaban biasa bukan galat')
assert(pesanGalat(lama('Saya menemukan 3 transaksi pada nota ini.')) === false,
  'ringkasan hasil bukan galat')
assert(pesanGalat(lama('Kuota material untuk pekerjaan ini sudah terpakai 80%.')) === false,
  'kata "kuota" di tengah kalimat bukan penanda — itu istilah proyek yang wajar')
assert(pesanGalat(lama('Nota ini tidak bisa saya baca, fotonya terlalu buram.')) === false,
  'AI yang mengaku tidak bisa membaca tetap jawaban sungguhan')

// ── Yang diketik pemakai tidak pernah dibuang ────────────────────────────
{
  // Pemakai bisa saja menempelkan pesan galat untuk ditanyakan. Itu percakapan,
  // dan membuangnya membuat pertanyaannya kehilangan isi.
  const p = { id: 'u', role: 'user', text: '⚠️ Kuota layanan AI sudah terpakai habis. ini kenapa?' }
  assert(pesanGalat(p) === false, 'pesan pemakai tidak pernah dianggap gelembung galat')
  assert(riwayatUntukModel([p]).length === 1, 'dan tetap ikut dikirim')
}

// ── Masukan yang aneh tidak boleh menghapus riwayat ──────────────────────
assert(pesanGalat(null) === false, 'null aman')
assert(pesanGalat(undefined) === false, 'undefined aman')
assert(pesanGalat({ role: 'assistant' }) === false, 'tanpa teks bukan galat')
assert(pesanGalat({ role: 'assistant', text: '   ' }) === false, 'spasi saja bukan galat')
assert(riwayatUntukModel(null).length === 0, 'riwayat null aman')
assert(riwayatUntukModel([]).length === 0, 'riwayat kosong aman')
assert(riwayatUntukModel([null, undefined]).length === 0, 'entri kosong dilewati, bukan meledak')
{
  // Penanda menang atas isi: apa pun bunyinya, yang ditandai galat dibuang.
  const p = { id: 'z', role: 'assistant', galat: true, text: 'Baik, saya catat.' }
  assert(pesanGalat(p) === true, 'penanda eksplisit menentukan')
}

// ── Lampiran ikut terbawa apa adanya ─────────────────────────────────────
{
  const riwayat = [{ id: '1', role: 'user', text: '', files: [{ nama: 'nota.jpg' }] }]
  assert(riwayatUntukModel(riwayat)[0].files.length === 1, 'pesan berlampiran tetap utuh')
}

console.log(`riwayat-chat: ${ok} assert lulus`)
