// Test penerjemahan kalimat bebas menjadi instruksi render 3D.
import {
  bacaSudut, bacaWaktu, susunPromptRender, judulRender, LABEL_SUDUT,
} from '../src/lib/promptRender.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── bacaSudut ──────────────────────────────────────────────────────────────
assert(bacaSudut('coba tampak depan dong') === 'depan', 'tampak depan dikenali')
assert(bacaSudut('render dari drone') === 'atas', 'drone berarti mata burung')
assert(bacaSudut('mau lihat dari udara') === 'atas', 'udara juga mata burung')
assert(bacaSudut('perspektif sudut modern') === 'sudut', 'perspektif dikenali')
assert(bacaSudut('setinggi mata orang') === 'mata_manusia', 'eye level dikenali')
assert(bacaSudut('interior ruang tamu') === 'interior', 'interior dikenali')
// Yang paling khusus harus menang, bukan yang kebetulan disebut lebih dulu.
assert(bacaSudut('dari dalam ruangan, tampak depan jendela') === 'interior',
  'interior menang atas kata "depan" yang ikut muncul')
assert(bacaSudut('gaya tropis warna putih') === null, 'tanpa petunjuk sudut, null')
assert(bacaSudut('') === null && bacaSudut(undefined) === null, 'masukan kosong aman')

// ── bacaWaktu ──────────────────────────────────────────────────────────────
assert(/malam/.test(bacaWaktu('suasana malam hari')), 'malam dikenali')
assert(/golden hour/.test(bacaWaktu('coba sore golden hour')), 'sore dikenali')
assert(/pagi/.test(bacaWaktu('pagi hari cerah')), 'pagi dikenali')
assert(/mendung/.test(bacaWaktu('langit mendung')), 'mendung dikenali')
assert(bacaWaktu('modern minimalis') === null, 'tanpa petunjuk waktu, null')

// ── susunPromptRender: batasan tata letak selalu ikut ──────────────────────
{
  const p = susunPromptRender('gaya tropis kontemporer')
  assert(/GROUND TRUTH tata letak/.test(p), 'layout ditegaskan sebagai kebenaran')
  assert(/BENTUK BATAS LAHAN identik/.test(p), 'bentuk lahan dikunci')
  assert(/dilarang menambah, mengurangi, atau memindahkan/.test(p), 'blok bangunan dikunci')
  assert(/HANYA boleh mengubah RUPA/.test(p), 'prompt dibatasi ke rupa saja')
  assert(/ABAIKAN bagian itu/.test(p), 'permintaan yang mengubah tata letak diperintahkan diabaikan')
  assert(/gaya tropis kontemporer/.test(p), 'permintaan pemakai ikut masuk')
  assert(/Perspektif Sudut/.test(p), 'tanpa sudut disebut, jatuh ke perspektif sudut')
  assert(!/LAMPIRAN 2/.test(p), 'tanpa acuan, lampiran kedua tidak disebut')
  assert(!/KONSISTENSI/.test(p), 'aturan konsistensi hanya muncul bila ada acuan')
}

// Setiap prompt berdiri sendiri: aturannya ditulis ulang, bukan diasumsikan.
{
  const a = susunPromptRender('yang tadi tapi malam hari', { riwayat: ['gaya tropis'] })
  assert(/BENTUK BATAS LAHAN identik/.test(a), 'aturan tetap ditulis ulang di permintaan lanjutan')
  assert(/gaya tropis/.test(a), 'riwayat dibawa supaya rujukan "yang tadi" bisa dimengerti')
  assert(/malam hari dengan pencahayaan/.test(a), 'waktu dari kalimat diterjemahkan')
}

// Acuan render sebelumnya menambah aturan konsistensi.
{
  const p = susunPromptRender('tampak depan', { adaAcuan: true })
  assert(/LAMPIRAN 2/.test(p), 'acuan disebut')
  assert(/KONSISTENSI/.test(p), 'aturan konsistensi muncul')
  assert(/Tampak Depan/.test(p), 'sudut mengikuti permintaan')
}

// Deskripsi layout ikut bila ada.
{
  const p = susunPromptRender('modern', { deskripsiLayout: '12 kavling, 1 blok ruko, jalan loop' })
  assert(/12 kavling, 1 blok ruko/.test(p), 'deskripsi layout ikut masuk')
  const tanpa = susunPromptRender('modern', { deskripsiLayout: '   ' })
  assert(!/LAYOUT MENURUT ANALISIS/.test(tanpa), 'deskripsi kosong tidak menyisakan judul menggantung')
}

// Riwayat dibatasi supaya prompt tidak membengkak tanpa batas.
{
  const banyak = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']
  const p = susunPromptRender('lanjut', { riwayat: banyak })
  assert(!/a1/.test(p) && /a6/.test(p), 'hanya beberapa permintaan terakhir yang dibawa')
}

// Permintaan kosong tetap menghasilkan prompt yang bisa dijalankan.
{
  const p = susunPromptRender('')
  assert(/Render kawasan ini apa adanya/.test(p), 'permintaan kosong diberi isi bawaan')
  assert(/16:9/.test(p), 'rasio gambar tetap ditentukan')
  assert(/Tanpa teks, watermark/.test(p), 'gambar diminta bersih dari teks')
}

// ── judulRender ────────────────────────────────────────────────────────────
assert(judulRender('gaya tropis') === 'gaya tropis', 'judul memakai permintaannya')
assert(judulRender('tampak depan') === `tampak depan · ${LABEL_SUDUT.depan}`, 'sudut ikut di judul')
assert(judulRender('') === 'Render kawasan', 'judul bawaan untuk permintaan kosong')
{
  const panjang = judulRender('a'.repeat(80))
  assert(panjang.length <= 48 && panjang.endsWith('…'), 'judul panjang dipotong')
}
assert(judulRender('  gaya   tropis  ') === 'gaya tropis', 'spasi berlebih dirapikan')

console.log(`prompt-render: ${ok} assert lulus`)
