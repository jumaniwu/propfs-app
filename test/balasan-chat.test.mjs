// ============================================================
// Membersihkan balasan AI sebelum ditampilkan.
//
// Blok ```json memang sudah dibuang sebelum tampil. Yang tertinggal adalah
// KALIMAT YANG MEMPERKENALKANNYA — "Berikut data JSON untuk pencatatan
// sistem:" — menunjuk sesuatu yang tidak ada lagi. Pemakainya bukan
// programmer; ia melihat aplikasi menjanjikan sesuatu lalu tidak
// memberikannya.
//
// Yang dijaga di sini ada dua arah, dan arah kedua sama pentingnya:
// kalimat yang MEMANG jawaban atas pertanyaan pemakainya tidak boleh ikut
// terbuang.
// ============================================================
import { bersihkanBalasan, masihBocor } from '../src/lib/balasanChat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Kalimat pengantar yang benar-benar terlihat di layar ────────────────
{
  const a = `Terima kasih banyak sudah mengingatkan dan mengoreksi, Pak!
Berikut perintah JSON untuk menghapus data duplikat tersebut dari sistem:`
  const b = bersihkanBalasan(a)
  assert(!masihBocor(b), `kata JSON tidak boleh tersisa: ${JSON.stringify(b)}`)
  assert(b.endsWith('mengoreksi, Pak!'), `kalimat sebelumnya utuh: ${JSON.stringify(b)}`)
}
{
  const a = `Apakah data di atas sudah sesuai dan dapat langsung disimpan?

Berikut data JSON untuk pencatatan sistem:`
  const b = bersihkanBalasan(a)
  assert(!masihBocor(b), 'pengantar kedua ikut dibuang')
  assert(b.endsWith('langsung disimpan?'), 'pertanyaan ke pemakainya dipertahankan')
}

// ── 2. Bentuk lain yang mungkin ditulis model ──────────────────────────────
for (const pengantar of [
  'Berikut JSON-nya:',
  'Berikut adalah JSON untuk sistem:',
  'JSON:',
  '- Berikut blok data untuk sistem:',
  '1. Berikut kode di bawah untuk disimpan:',
  'Here is the JSON payload:',
  'Data JSON:',
]) {
  const b = bersihkanBalasan(`Nota sudah dicatat.\n\n${pengantar}`)
  assert(b === 'Nota sudah dicatat.', `pengantar dibuang: ${JSON.stringify(pengantar)} → ${JSON.stringify(b)}`)
}

// ── 3. Dua baris pengantar berturut-turut ─────────────────────────────────
{
  const b = bersihkanBalasan('Sudah saya catat.\n\nRingkasan tersimpan.\nBerikut data JSON:\nJSON:')
  assert(!masihBocor(b), 'dua pengantar berturut-turut dibuang semua')
  assert(b.includes('Ringkasan tersimpan.'), 'kalimat yang sah tetap ada')
}

// ── 4. Pagar blok kode yang menggantung ───────────────────────────────────
{
  const b = bersihkanBalasan('Sudah dicatat.\n```json')
  assert(b === 'Sudah dicatat.', `pagar tanpa penutup dibuang: ${JSON.stringify(b)}`)
  const c = bersihkanBalasan('Sudah dicatat.\n```')
  assert(c === 'Sudah dicatat.', 'pagar polos juga')
}

// ── 5. ARAH SEBALIKNYA: yang sah TIDAK boleh terbuang ─────────────────────
//
// Kalau pemakainya bertanya tentang JSON, jawabannya adalah jawaban — bukan
// kebocoran. Membuangnya berarti aplikasinya menolak menjawab pertanyaan
// yang diajukan kepadanya.
{
  const a = 'Format JSON dipakai sistem untuk bertukar data, Pak. Semen sudah dicatat.'
  assert(bersihkanBalasan(a) === a, 'kata JSON di TENGAH kalimat tidak disentuh')
}
{
  const a = 'Sudah dicatat semua.'
  assert(bersihkanBalasan(a) === a, 'balasan biasa tidak berubah sedikit pun')
}
{
  const a = 'Rekap:\n- Semen 50 sak\n- Besi 20 batang'
  assert(bersihkanBalasan(a) === a, 'daftar barang tidak ikut terpotong')
}
{
  // Baris terakhir yang berakhir titik dua TAPI tidak menyebut data sistem
  // adalah judul yang sah — mis. tabel yang menyusul.
  const a = 'Berikut rincian transaksinya:'
  assert(bersihkanBalasan(a) === a, 'pengantar biasa tanpa kata JSON dipertahankan')
}
{
  const a = 'Ringkasan Tindakan Revisi:'
  assert(bersihkanBalasan(a) === a, 'judul bagian tidak dianggap kebocoran')
}

// ── 6. Masukan aneh ───────────────────────────────────────────────────────
assert(bersihkanBalasan('') === '', 'kosong')
assert(bersihkanBalasan(null) === '', 'null aman')
assert(bersihkanBalasan(undefined) === '', 'undefined aman')
assert(bersihkanBalasan('   \n\n  ') === '', 'spasi saja jadi kosong')
assert(bersihkanBalasan('Berikut data JSON:') === '', 'yang isinya HANYA pengantar jadi kosong')
assert(typeof bersihkanBalasan(123) === 'string', 'angka tetap menghasilkan string')

// CRLF dari sebagian model tidak boleh menghalangi pencocokan.
{
  const b = bersihkanBalasan('Sudah dicatat.\r\n\r\nBerikut data JSON:')
  assert(b === 'Sudah dicatat.', `CRLF tetap tertangani: ${JSON.stringify(b)}`)
}

console.log(`balasan-chat: ${ok} assert lulus`)
