// ============================================================
// Subjek materi promosi.
//
// Yang diuji di sini bukan "fungsinya jalan", melainkan bahwa modul ini
// benar-benar MELEPASKAN Marcom dari proyek aktif. Sebelumnya nama proyek
// diturunkan dari proyek yang kebetulan terbuka dan tidak bisa diubah — lalu
// DIBAKAR ke dalam gambar. Materi yang salah nama tidak bisa diperbaiki
// setelah diunggah; yang bisa dilakukan hanyalah menghapus unggahannya.
//
// Tiga hal yang dijaga paling keras:
//   1. Judulnya bisa diganti, dan ganti proyek benar-benar mengganti isinya.
//   2. Berpindah ke "ketik sendiri" MENGOSONGKAN judul lama — nama proyek yang
//      tertinggal di kolom adalah cara paling mudah mencetak materi salah.
//   3. Bentuk barisnya sama persis dengan yang dicetak marcom.ts.
// ============================================================
import {
  subjekDariProyek, subjekAwal, pilihanSubjek, pilihSubjek, nilaiTerpilih,
  pratinjauGaris, adaGarisProyek, modeSetelahKetik,
  proyekAsingDiCaption, captionMasihBawaan,
  SUBJEK_KOSONG, TANPA_PROYEK, KETIK_SENDIRI,
} from '../src/lib/marcomSubjek.ts'
import { garisProyek } from '../src/lib/marcom.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const RUKO = { id: 'p1', projectName: 'Ruko Pak Soni', location: 'Ruko De Monde Bay', type: 'Ruko' }
const NOBLE = { id: 'p2', projectName: 'Noble Cove Residence', location: 'Jl. Merdeka, Jambi', type: 'Perumahan' }
const DAFTAR = [RUKO, NOBLE]

// ── 1. Subjek dari proyek ──────────────────────────────────────────────────
{
  const s = subjekDariProyek(NOBLE)
  assert(s.judul === 'Noble Cove Residence', 'judul dari nama proyek')
  assert(s.lokasi === 'Jl. Merdeka, Jambi', 'lokasi ikut')
  // Jenis proyek BUKAN lingkup pekerjaan. "Project: Noble Cove | Perumahan"
  // berbunyi seperti keterangan kategori, bukan pengumuman pekerjaan.
  assert(s.lingkup === '', 'jenis proyek tidak diselundupkan sebagai lingkup')

  assert(subjekDariProyek(null).judul === '', 'null aman')
  assert(subjekDariProyek({ projectName: '  Noble   Cove  ' }).judul === 'Noble Cove', 'spasi dirapikan')
}

// ── 2. Tawaran awal ────────────────────────────────────────────────────────
assert(subjekAwal(RUKO, DAFTAR).judul === 'Ruko Pak Soni', 'proyek aktif jadi tawaran')
assert(subjekAwal(null, DAFTAR).judul === 'Ruko Pak Soni', 'tanpa proyek aktif: yang pertama')
assert(subjekAwal(null, []).judul === '', 'tanpa proyek sama sekali: kosong, bukan melempar')
assert(subjekAwal(null, null).judul === '', 'null aman')
assert(subjekAwal({ projectName: '  ' }, DAFTAR).judul === 'Ruko Pak Soni',
  'proyek aktif tanpa nama dilewati')

// ── 3. Isi pemilih ─────────────────────────────────────────────────────────
{
  const p = pilihanSubjek(DAFTAR)
  assert(p.length === 4, `dua proyek + dua pilihan khusus, dapat ${p.length}`)
  assert(p[0].label === 'Ruko Pak Soni' && p[1].label === 'Noble Cove Residence', 'urutan proyek')

  // Dua pilihan yang membuat modul ini berhenti terkurung pada proyek aktif.
  assert(p.some(x => x.nilai === KETIK_SENDIRI), 'ada "ketik sendiri" — proyek baru diumumkan sebelum RAB-nya ada')
  assert(p.some(x => x.nilai === TANPA_PROYEK), 'ada "tanpa proyek" — untuk materi perusahaan')

  assert(pilihanSubjek([]).length === 2, 'tanpa proyek pun pemilihnya tetap berguna')
  assert(pilihanSubjek(null).length === 2, 'null aman')

  // Proyek tanpa nama tidak boleh jadi pilihan kosong yang tak bisa dikenali.
  assert(pilihanSubjek([{ id: 'x', projectName: '  ' }]).length === 2, 'proyek tanpa nama dibuang')

  // Nilai kembar membuat pemilihnya tidak bisa membedakan mana yang dipilih.
  const kembar = pilihanSubjek([RUKO, { ...RUKO }])
  assert(kembar.length === 3, `id kembar disatukan, dapat ${kembar.length}`)
}

// ── 4. Berganti pilihan ────────────────────────────────────────────────────
{
  const awal = { judul: 'Ruko Pak Soni', lokasi: 'Ruko De Monde Bay', lingkup: 'Civil, Arsitektur & MEP' }

  // INTI PERMINTAANNYA: bisa berpindah ke proyek lain.
  const noble = pilihSubjek('p2', DAFTAR, awal)
  assert(noble.judul === 'Noble Cove Residence', 'berpindah ke Noble Cove')
  assert(noble.lokasi === 'Jl. Merdeka, Jambi', 'lokasinya ikut berpindah')
  // Lingkup dipertahankan: ia berlaku untuk seluruh proyek perusahaan itu.
  assert(noble.lingkup === 'Civil, Arsitektur & MEP', 'lingkup yang sudah diketik tidak hilang')

  // Ketik sendiri: judul DIKOSONGKAN.
  const ketik = pilihSubjek(KETIK_SENDIRI, DAFTAR, awal)
  assert(ketik.judul === '', 'judul lama dikosongkan — kalau tertinggal, materinya tercetak salah nama')
  assert(ketik.lokasi === '', 'lokasi lama ikut dikosongkan')
  assert(ketik.lingkup === 'Civil, Arsitektur & MEP', 'lingkup tetap')

  const tanpa = pilihSubjek(TANPA_PROYEK, DAFTAR, awal)
  assert(tanpa.judul === '' && tanpa.lokasi === '', 'tanpa proyek: bersih')

  // Nilai yang tidak dikenali tidak boleh menyisakan proyek lama.
  const asing = pilihSubjek('proyek-yang-sudah-dihapus', DAFTAR, awal)
  assert(asing.judul === '', 'pilihan asing mengosongkan, bukan mempertahankan yang lama')

  assert(pilihSubjek('p2', DAFTAR).lingkup === '', 'tanpa `sebelumnya` tetap jalan')
}

// ── 5. Pemilih ikut ketikan ────────────────────────────────────────────────
//
// Judulnya bisa diketik bebas setelah dipilih. Begitu ketikannya tidak lagi
// cocok dengan proyek mana pun, pemilihnya harus berpindah sendiri — kalau
// tidak, layarnya mengaku menampilkan proyek yang sudah tidak dipakai.
assert(nilaiTerpilih({ judul: 'Ruko Pak Soni', lokasi: '', lingkup: '' }, DAFTAR) === 'p1', 'cocok proyek')
assert(nilaiTerpilih({ judul: 'ruko pak soni', lokasi: '', lingkup: '' }, DAFTAR) === 'p1', 'beda huruf besar tetap cocok')
assert(nilaiTerpilih({ judul: 'Griya Asri', lokasi: '', lingkup: '' }, DAFTAR) === KETIK_SENDIRI,
  'judul di luar daftar → ketik sendiri')
assert(nilaiTerpilih(SUBJEK_KOSONG, DAFTAR) === TANPA_PROYEK, 'judul kosong → tanpa proyek')
assert(nilaiTerpilih({ judul: '  ', lokasi: '', lingkup: '' }, DAFTAR) === TANPA_PROYEK, 'spasi = kosong')
assert(nilaiTerpilih(SUBJEK_KOSONG, null) === TANPA_PROYEK, 'daftar null aman')

// ── 5b. Mode pemilih setelah diketik ───────────────────────────────────────
//
// CACAT YANG DITEMUKAN SAAT MENJALANKANNYA, bukan saat membacanya.
//
// Mula-mula nilai pemilih diturunkan dari judulnya: "judul kosong berarti
// tanpa proyek". Terdengar rapi, tetapi menelan dirinya sendiri — memilih
// "ketik sendiri" mengosongkan judul (memang harus, supaya nama lama tidak
// tertinggal), turunannya membaca kosong itu sebagai "tanpa proyek", dan
// kolom yang baru diminta untuk diketik LENYAP sebelum sempat disentuh.
assert(modeSetelahKetik('', DAFTAR, KETIK_SENDIRI) === KETIK_SENDIRI,
  'judul kosong saat ketik sendiri TETAP ketik sendiri — kolomnya tidak boleh lenyap')
assert(modeSetelahKetik('Griya Asri', DAFTAR, KETIK_SENDIRI) === KETIK_SENDIRI,
  'nama di luar daftar tetap ketik sendiri')
assert(modeSetelahKetik('Noble Cove Residence', DAFTAR, KETIK_SENDIRI) === 'p2',
  'mengetik nama yang cocok memindahkan pemilih ke proyeknya')
assert(modeSetelahKetik('noble cove residence', DAFTAR, 'p1') === 'p2',
  'beda huruf besar tetap cocok')
assert(modeSetelahKetik('Ruko Pak Soni Ubahan', DAFTAR, 'p1') === KETIK_SENDIRI,
  'menyunting nama proyek melepasnya dari proyek itu')
// Materi perusahaan tidak punya kolom judul; modenya tidak boleh bergeser.
assert(modeSetelahKetik('apa pun', DAFTAR, TANPA_PROYEK) === TANPA_PROYEK, 'tanpa proyek tidak bergeser')
assert(modeSetelahKetik('', null, KETIK_SENDIRI) === KETIK_SENDIRI, 'daftar null aman')

// ── 6. Baris yang tercetak ─────────────────────────────────────────────────
{
  const s = { judul: 'Noble Cove Residence', lokasi: 'Jambi', lingkup: 'Civil & Arsitektur' }
  assert(pratinjauGaris(s) === 'Project: Noble Cove Residence | Civil & Arsitektur',
    `lingkup menang atas lokasi: ${pratinjauGaris(s)}`)

  const tanpaLingkup = { judul: 'Noble Cove Residence', lokasi: 'Jambi', lingkup: '' }
  assert(pratinjauGaris(tanpaLingkup) === 'Project: Noble Cove Residence | Jambi',
    'tanpa lingkup, lokasi yang dipakai')

  assert(pratinjauGaris({ judul: 'Noble Cove', lokasi: '', lingkup: '' }) === 'Project: Noble Cove',
    'tanpa pemisah menggantung')
  assert(pratinjauGaris({ judul: '', lokasi: '', lingkup: 'Renovasi' }) === 'Renovasi',
    'tanpa judul: lingkupnya saja, tanpa kata "Project:"')
  assert(pratinjauGaris(SUBJEK_KOSONG) === '', 'kosong')
  assert(pratinjauGaris(null) === '', 'null aman')

  // HARUS sama persis dengan yang benar-benar dicetak marcom.ts. Kalau
  // keduanya berbeda, pratinjaunya berbohong — dan berbohong tentang tulisan
  // yang dibakar ke dalam foto.
  for (const [judul, lingkup, lokasi] of [
    ['Noble Cove', 'Civil', 'Jambi'],
    ['Noble Cove', '', 'Jambi'],
    ['Noble Cove', '', ''],
    ['', 'Civil', ''],
    ['', '', ''],
  ]) {
    const subjek = { judul, lokasi, lingkup }
    const dari = garisProyek(judul, lingkup || lokasi)
    assert(pratinjauGaris(subjek) === dari,
      `pratinjau = cetakan untuk (${judul}|${lingkup}|${lokasi}): "${pratinjauGaris(subjek)}" vs "${dari}"`)
  }
}

// ── 7. Pita kosong itu sah ─────────────────────────────────────────────────
assert(adaGarisProyek({ judul: 'Noble Cove', lokasi: '', lingkup: '' }), 'ada garis')
assert(!adaGarisProyek(SUBJEK_KOSONG), 'materi perusahaan: pitanya memang kosong')
assert(!adaGarisProyek(null), 'null aman')

// ── 8. Caption yang tertinggal di proyek lama ──────────────────────────────
//
// Gambar dan caption disusun terpisah. Ganti subjek, gambarnya ikut — tetapi
// captionnya, yang sudah lebih dulu ditulis, tetap menyebut proyek lama. Dan
// yang DITEMPEL orang ke Instagram adalah captionnya.
{
  const NAMA = ['Ruko Pak Soni', 'Noble Cove Residence']
  const capt = 'Update progres Ruko Pak Soni — Ruko De Monde Bay.\n\n#kontraktor #RukoDeMondeBay'

  const asing = proyekAsingDiCaption(capt, 'Noble Cove Residence', NAMA)
  assert(asing.includes('Ruko Pak Soni'), `nama proyek lama terdeteksi: ${JSON.stringify(asing)}`)
  assert(!asing.includes('Noble Cove Residence'), 'subjek sekarang bukan "asing"')

  // Tagar adalah bentuk yang paling sering tertinggal dan paling jarang
  // dibaca ulang sebelum ditempel.
  const hanyaTagar = proyekAsingDiCaption('Selamat pagi! #RukoPakSoni', 'Noble Cove Residence', NAMA)
  assert(hanyaTagar.includes('Ruko Pak Soni'), 'terdeteksi walau hanya muncul sebagai tagar')

  assert(proyekAsingDiCaption(capt, 'Ruko Pak Soni', NAMA).length === 0,
    'caption yang memang menyebut subjeknya sendiri: bersih')
  assert(proyekAsingDiCaption('', 'X', NAMA).length === 0, 'caption kosong')
  assert(proyekAsingDiCaption(null, 'X', NAMA).length === 0, 'null aman')
  assert(proyekAsingDiCaption(capt, 'X', null).length === 0, 'daftar null aman')
  assert(proyekAsingDiCaption(capt, 'X', ['', '  ', null]).length === 0, 'nama kosong dilewati')

  // Satu nama tidak dilaporkan dua kali walau muncul polos DAN sebagai tagar.
  const dua = proyekAsingDiCaption('Ruko Pak Soni #RukoPakSoni', 'X', NAMA)
  assert(dua.length === 1, `tidak dilaporkan dua kali, dapat ${dua.length}`)
}

// ── 9. Caption siapa yang boleh ditimpa ────────────────────────────────────
//
// Hanya naskah bawaan yang belum disentuh. Sekali orang mengetik satu huruf
// di dalamnya, ia miliknya — dan menghapusnya diam-diam adalah kesalahan yang
// lebih mahal daripada nama yang tertinggal, karena tidak bisa dikembalikan.
assert(captionMasihBawaan('', 'apa pun'), 'kosong boleh diisi')
assert(captionMasihBawaan('   ', 'apa pun'), 'spasi saja dianggap kosong')
assert(captionMasihBawaan('Naskah A', 'Naskah A'), 'masih persis naskahnya')
assert(!captionMasihBawaan('Naskah A yang disunting', 'Naskah A'), 'sudah disunting: jangan disentuh')
assert(!captionMasihBawaan('Tulisan AI', 'Naskah A'), 'ditulis AI: jangan disentuh')
assert(!captionMasihBawaan('Naskah A', null), 'tanpa naskah pembanding: anggap milik orang')

console.log(`marcom-subjek: ${ok} assert lulus`)
